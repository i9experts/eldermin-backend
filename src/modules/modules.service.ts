import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MODULE_REGISTRY, getModuleById } from './module-registry';

@Injectable()
export class ModulesService {
  constructor(
    @InjectModel('School') private schoolModel: Model<any>,
  ) {}

  async listModules(schoolSlug: string) {
    const school = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    if (!school) throw new NotFoundException('School not found');

    const activeModules: string[] = (school as any).activeModules || ['organization'];

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

  async activateModule(schoolSlug: string, moduleId: string) {
    const moduleDef = getModuleById(moduleId);
    if (!moduleDef) throw new NotFoundException(`Module '${moduleId}' not found in registry`);

    const school = await this.schoolModel.findOne({ slug: schoolSlug });
    if (!school) throw new NotFoundException('School not found');

    const activeModules: string[] = (school as any).activeModules || ['organization'];

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
    await this.schoolModel.updateOne(
      { slug: schoolSlug },
      { $set: { activeModules: updatedModules } },
    );

    return {
      success: true,
      moduleId,
      moduleName: moduleDef.name,
      activeModules: updatedModules,
      message: `${moduleDef.name} activated successfully`,
    };
  }

  async deactivateModule(schoolSlug: string, moduleId: string) {
    const moduleDef = getModuleById(moduleId);
    if (!moduleDef) throw new NotFoundException(`Module '${moduleId}' not found in registry`);

    if (moduleDef.isCore) {
      throw new BadRequestException(`'${moduleDef.name}' is a core module and cannot be deactivated`);
    }

    const school = await this.schoolModel.findOne({ slug: schoolSlug });
    if (!school) throw new NotFoundException('School not found');

    const activeModules: string[] = (school as any).activeModules || [];

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
    await this.schoolModel.updateOne(
      { slug: schoolSlug },
      { $set: { activeModules: updatedModules } },
    );

    return {
      success: true,
      moduleId,
      moduleName: moduleDef.name,
      activeModules: updatedModules,
      message: `${moduleDef.name} deactivated successfully`,
    };
  }

  async bulkActivate(schoolSlug: string, moduleIds: string[]) {
    const school = await this.schoolModel.findOne({ slug: schoolSlug });
    if (!school) throw new NotFoundException('School not found');

    const activeModules: string[] = (school as any).activeModules || ['organization'];
    const merged = Array.from(new Set([...activeModules, ...moduleIds, 'organization']));

    await this.schoolModel.updateOne(
      { slug: schoolSlug },
      { $set: { activeModules: merged } },
    );

    return {
      success: true,
      activeModules: merged,
      message: `${moduleIds.length} modules activated`,
    };
  }
}
