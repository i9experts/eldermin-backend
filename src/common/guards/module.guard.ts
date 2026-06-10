import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const REQUIRES_MODULE_KEY = 'requiresModule';
export const RequiresModule = (moduleName: string) => SetMetadata(REQUIRES_MODULE_KEY, moduleName);

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(REQUIRES_MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const { user } = context.switchToHttp().getRequest();
    const active: string[] = user?.activeModules || [];
    if (!active.includes(required)) {
      throw new ForbiddenException({ error: 'MODULE_NOT_ACTIVE', module: required, message: `The "${required}" module is not activated` });
    }
    return true;
  }
}
