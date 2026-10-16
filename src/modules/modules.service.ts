import { Injectable, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MODULE_REGISTRY, getModuleById, computeModulePricing, modulesForPlan } from './module-registry';
import { Tenant, TenantDocument } from './organization/schemas/tenant.schema';
import { Institution, InstitutionDocument, SubscriptionHistory, SubscriptionHistoryDocument } from '../super-admin/schemas/super-admin.schema';

@Injectable()
export class ModulesService {
  constructor(
    @InjectModel('School') private schoolModel: Model<any>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Institution.name) private institutionModel: Model<InstitutionDocument>,
    @InjectModel(SubscriptionHistory.name) private subHistoryModel: Model<SubscriptionHistoryDocument>,
  ) {}

  // Real activation state has drifted across three collections in
  // production (School.activeModules, which this dashboard reads;
  // Tenant.activeModules, which login actually signs into the JWT; and
  // Institution.enabledModules, Super Admin's own billing/tracking copy)
  // - see syncAcrossCollections, which every write path below now keeps
  // in lockstep. Reading the union here is a self-healing fix for
  // whatever already drifted apart before this existed: a module that's
  // real and active in any one of the three shows as active, rather than
  // a school that's actively using a module still seeing it as
  // "available"/"locked" just because one write path missed it.
  private async resolveActiveModules(schoolSlug: string): Promise<{ school: any; activeModules: string[] }> {
    const [school, tenant] = await Promise.all([
      this.schoolModel.findOne({ slug: schoolSlug }).lean(),
      this.tenantModel.findOne({ slug: schoolSlug }).lean(),
    ]);
    if (!school) throw new NotFoundException('School not found');

    const fromSchool: string[] = (school as any).activeModules || [];
    const fromTenant: string[] = (tenant as any)?.activeModules || [];
    const merged = Array.from(new Set(['organization', ...fromSchool, ...fromTenant]));
    return { school, activeModules: merged };
  }

  // Single write path for every activation/deactivation below - keeps
  // School, Tenant, and the Super Admin's Institution tracking record
  // (modules + billing) all moving together, and logs the billing change
  // to SubscriptionHistory so Super Admin has a real audit trail of why
  // an institution's monthlyRevenue changed, not just a silently updated
  // number. Institution/SubscriptionHistory writes are best-effort - a
  // school with no platform_institutions tracking row yet (e.g. seeded
  // directly rather than via the lead-activation/onboarding flow) still
  // gets its real School/Tenant module state updated regardless.
  private async syncAcrossCollections(schoolSlug: string, updatedModules: string[], changedBy = 'school-admin') {
    await Promise.all([
      this.schoolModel.updateOne({ slug: schoolSlug }, { $set: { activeModules: updatedModules } }),
      this.tenantModel.updateOne({ slug: schoolSlug }, { $set: { activeModules: updatedModules } }),
    ]);

    const institution = await this.institutionModel.findOne({ slug: schoolSlug });
    if (!institution) return;

    const { monthlyRevenue, lineItems } = computeModulePricing(updatedModules);
    const previousRevenue = institution.monthlyRevenue || 0;
    institution.enabledModules = updatedModules;
    institution.monthlyRevenue = monthlyRevenue;
    await institution.save();

    if (monthlyRevenue !== previousRevenue) {
      await new this.subHistoryModel({
        institutionSlug: schoolSlug,
        institutionName: institution.name,
        event: monthlyRevenue > previousRevenue ? 'upgrade' : 'downgrade',
        fromPlan: institution.plan,
        toPlan: institution.plan,
        amount: monthlyRevenue,
        paymentStatus: 'pending',
        notes: `Module change: ${lineItems.map((li) => li.name).join(', ') || 'none'} (PKR ${monthlyRevenue.toLocaleString()}/mo)`,
        processedBy: changedBy,
        effectiveDate: new Date(),
      }).save();
    }
  }

  // The school's subscribed package, straight from Super Admin's own
  // billing record - undefined for a school with no Institution tracking
  // row yet (seeded directly rather than via the lead-activation/
  // onboarding flow), in which case plan entitlement simply isn't
  // enforced, matching this method's existing behaviour before packages
  // existed at all.
  private async getPlan(schoolSlug: string): Promise<string | undefined> {
    const inst = await this.institutionModel.findOne({ slug: schoolSlug }).select('plan').lean();
    return (inst as any)?.plan;
  }

  async listModules(schoolSlug: string) {
    const [{ activeModules }, plan] = await Promise.all([
      this.resolveActiveModules(schoolSlug),
      this.getPlan(schoolSlug),
    ]);
    const planModules = plan ? modulesForPlan(plan) : null;

    return MODULE_REGISTRY.map((mod) => {
      const isActive = activeModules.includes(mod.id);
      const missingDeps = mod.requiredModules.filter((dep) => !activeModules.includes(dep));
      const canActivate = missingDeps.length === 0;
      const inPlan = planModules ? planModules.includes(mod.id) : true;

      return {
        ...mod,
        status: isActive ? 'active' : !inPlan ? 'plan-locked' : canActivate ? 'available' : 'locked',
        inPlan,
        missingDependencies: missingDeps.map((id) => getModuleById(id)?.name || id),
        recommendedNames: mod.recommendedModules.map((id) => getModuleById(id)?.name || id),
      };
    });
  }

  async getSummary(schoolSlug: string) {
    const modules = await this.listModules(schoolSlug);
    return {
      total: modules.length,
      active: modules.filter((m) => m.status === 'active').length,
      available: modules.filter((m) => m.status === 'available').length,
      locked: modules.filter((m) => m.status === 'locked').length,
      planLocked: modules.filter((m) => m.status === 'plan-locked').length,
    };
  }

  // Self-service activation (a school's own Admin/Principal/Owner via the
  // Apps & Modules marketplace) is capped at what their subscribed
  // package actually includes - a school can turn on anything within its
  // package on its own, but reaching beyond it is an upgrade conversation
  // with Super Admin, not a free toggle. Super Admin's own direct control
  // (setActiveModules below) deliberately bypasses this check entirely.
  private async assertInPlan(schoolSlug: string, moduleIds: string[]) {
    const plan = await this.getPlan(schoolSlug);
    if (!plan) return; // no Institution tracking row - unrestricted, as before packages existed
    const allowed = modulesForPlan(plan);
    const outOfPlan = moduleIds.filter((id) => !allowed.includes(id));
    if (outOfPlan.length > 0) {
      const names = outOfPlan.map((id) => getModuleById(id)?.name || id);
      throw new ForbiddenException({
        message: `Not included in your current plan: ${names.join(', ')}. Ask your Eldermin account manager about upgrading.`,
        outOfPlanModules: names,
        plan,
      });
    }
  }

  async activateModule(schoolSlug: string, moduleId: string, changedBy?: string) {
    const moduleDef = getModuleById(moduleId);
    if (!moduleDef) throw new NotFoundException(`Module '${moduleId}' not found in registry`);
    await this.assertInPlan(schoolSlug, [moduleId]);

    const { activeModules } = await this.resolveActiveModules(schoolSlug);

    if (activeModules.includes(moduleId)) {
      throw new ConflictException(`Module '${moduleDef.name}' is already active`);
    }

    const missingDeps = moduleDef.requiredModules.filter((dep) => !activeModules.includes(dep));
    if (missingDeps.length > 0) {
      const missingNames = missingDeps.map((id) => getModuleById(id)?.name || id);
      throw new BadRequestException({
        message: `Cannot activate '${moduleDef.name}'. Missing required modules: ${missingNames.join(', ')}`,
        missingDependencies: missingNames,
      });
    }

    const updatedModules = [...activeModules, moduleId];
    await this.syncAcrossCollections(schoolSlug, updatedModules, changedBy);

    return {
      success: true,
      moduleId,
      moduleName: moduleDef.name,
      activeModules: updatedModules,
      message: `${moduleDef.name} activated successfully`,
    };
  }

  async deactivateModule(schoolSlug: string, moduleId: string, changedBy?: string) {
    const moduleDef = getModuleById(moduleId);
    if (!moduleDef) throw new NotFoundException(`Module '${moduleId}' not found in registry`);

    if (moduleDef.isCore) {
      throw new BadRequestException(`'${moduleDef.name}' is a core module and cannot be deactivated`);
    }

    const { activeModules } = await this.resolveActiveModules(schoolSlug);

    if (!activeModules.includes(moduleId)) {
      throw new ConflictException(`Module '${moduleDef.name}' is not currently active`);
    }

    const dependents = MODULE_REGISTRY.filter(
      (m) => activeModules.includes(m.id) && m.requiredModules.includes(moduleId),
    );
    if (dependents.length > 0) {
      const dependentNames = dependents.map((m) => m.name);
      throw new BadRequestException({
        message: `Cannot deactivate '${moduleDef.name}'. These active modules depend on it: ${dependentNames.join(', ')}`,
        dependentModules: dependentNames,
      });
    }

    const updatedModules = activeModules.filter((id) => id !== moduleId);
    await this.syncAcrossCollections(schoolSlug, updatedModules, changedBy);

    return {
      success: true,
      moduleId,
      moduleName: moduleDef.name,
      activeModules: updatedModules,
      message: `${moduleDef.name} deactivated successfully`,
    };
  }

  async bulkActivate(schoolSlug: string, moduleIds: string[], changedBy?: string) {
    await this.assertInPlan(schoolSlug, moduleIds);
    const { activeModules } = await this.resolveActiveModules(schoolSlug);
    const merged = Array.from(new Set([...activeModules, ...moduleIds, 'organization']));
    await this.syncAcrossCollections(schoolSlug, merged, changedBy);

    return {
      success: true,
      activeModules: merged,
      message: `${moduleIds.length} modules activated`,
    };
  }

  // Turns on every module the school's plan includes at once - for a
  // school that's genuinely using (or should have access to) everything
  // it's entitled to, rather than clicking "Activate" one at a time. Caps
  // at the plan's module set rather than the full registry, so a Starter
  // school hitting "Activate All" gets everything Starter includes
  // instead of a confusing all-or-nothing ForbiddenException - reaching
  // beyond the plan is still only possible via Super Admin's own direct
  // control (setActiveModules below).
  async activateAll(schoolSlug: string, changedBy?: string) {
    const plan = await this.getPlan(schoolSlug);
    const allModuleIds = plan ? modulesForPlan(plan) : MODULE_REGISTRY.map((m) => m.id);
    await this.syncAcrossCollections(schoolSlug, allModuleIds, changedBy);

    return {
      success: true,
      activeModules: allModuleIds,
      message: `All ${allModuleIds.length} modules activated`,
    };
  }

  // Super Admin's own direct control - sets a school's active module set
  // to exactly the given list, bypassing assertInPlan entirely (Super
  // Admin can grant modules outside a school's nominal plan, e.g. a
  // goodwill add-on, or claw back modules a plan would normally include).
  // Unlike activateModule/bulkActivate, this does not merge with the
  // existing set or validate dependencies - it's a full replace, since
  // Super Admin is expected to pass the complete intended module list
  // (e.g. from "reset to plan defaults" or a checkbox grid of all 17).
  async setActiveModules(schoolSlug: string, moduleIds: string[], changedBy = 'super-admin') {
    const unknown = moduleIds.filter((id) => !getModuleById(id));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown module id(s): ${unknown.join(', ')}`);
    }

    const updatedModules = Array.from(new Set(['organization', ...moduleIds]));
    await this.syncAcrossCollections(schoolSlug, updatedModules, changedBy);

    return {
      success: true,
      activeModules: updatedModules,
      message: `Active modules updated (${updatedModules.length} modules)`,
    };
  }

  // Resets a school's active modules back to exactly what its current
  // plan includes - the "undo my manual overrides" button next to
  // setActiveModules in the Super Admin command center.
  async resetModulesToPlan(schoolSlug: string, changedBy = 'super-admin') {
    const plan = await this.getPlan(schoolSlug);
    if (!plan) {
      throw new BadRequestException('School has no subscription plan on record to reset to');
    }
    return this.setActiveModules(schoolSlug, modulesForPlan(plan), changedBy);
  }
}
