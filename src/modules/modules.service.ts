import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MODULE_REGISTRY, getModuleById, computeModulePricing } from './module-registry';
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

  async listModules(schoolSlug: string) {
    const { activeModules } = await this.resolveActiveModules(schoolSlug);

    return MODULE_REGISTRY.map((mod) => {
      const isActive = activeModules.includes(mod.id);
      const missingDeps = mod.requiredModules.filter((dep) => !activeModules.includes(dep));
      const canActivate = missingDeps.length === 0;

      return {
        ...mod,
        status: isActive ? 'active' : canActivate ? 'available' : 'locked',
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
    };
  }

  async activateModule(schoolSlug: string, moduleId: string, changedBy?: string) {
    const moduleDef = getModuleById(moduleId);
    if (!moduleDef) throw new NotFoundException(`Module '${moduleId}' not found in registry`);

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
    const { activeModules } = await this.resolveActiveModules(schoolSlug);
    const merged = Array.from(new Set([...activeModules, ...moduleIds, 'organization']));
    await this.syncAcrossCollections(schoolSlug, merged, changedBy);

    return {
      success: true,
      activeModules: merged,
      message: `${moduleIds.length} modules activated`,
    };
  }

  // Turns on every module in the registry at once - for a school that's
  // genuinely using (or should have access to) everything, rather than
  // clicking "Activate" 16 times. Respects nothing to check for
  // dependencies since activating the full registry trivially satisfies
  // every requiredModules list.
  async activateAll(schoolSlug: string, changedBy?: string) {
    const allModuleIds = MODULE_REGISTRY.map((m) => m.id);
    await this.syncAcrossCollections(schoolSlug, allModuleIds, changedBy);

    return {
      success: true,
      activeModules: allModuleIds,
      message: `All ${allModuleIds.length} modules activated`,
    };
  }
}
