import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CustomRoleGuard } from './custom-role.guard';
import { TeachingController } from '../../modules/teaching/teaching.controller';

// End-to-end proof (not just "is the decorator attached" per
// teaching-module-access.spec.ts, but "does the guard actually reject/allow
// correctly for a real decorated Teaching route") of the reported bug's fix:
// a custom role with Lesson Plans set to None must 403 on the real route
// handler, and a role with Lesson Plans set to View must pass.

function makeGuard({ customRoleId, roleDoc }: { customRoleId: string | null; roleDoc: any }) {
  const reflector = new Reflector();
  const userModel: any = {
    findById: () => ({ select: () => ({ lean: () => Promise.resolve(customRoleId ? { customRoleId } : {}) }) }),
  };
  const roleModel: any = {
    findById: () => ({ select: () => ({ lean: () => Promise.resolve(roleDoc) }) }),
  };
  return new CustomRoleGuard(reflector, roleModel, userModel);
}

function contextFor(handler: Function, userId = 'u1') {
  return {
    getHandler: () => handler,
    getClass: () => TeachingController,
    switchToHttp: () => ({ getRequest: () => ({ user: { userId } }) }),
  } as any;
}

describe('CustomRoleGuard on a real Teaching route (TeachingController.getLessonPlans)', () => {
  it('denies a custom-role user whose Lesson Plans sub-module is not granted ("None")', async () => {
    const guard = makeGuard({
      customRoleId: 'r1',
      roleDoc: { moduleAccess: [{ moduleKey: 'teaching', subModuleKey: 'timetable', level: 'view' }] },
    });
    await expect(guard.canActivate(contextFor(TeachingController.prototype.getLessonPlans)))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a custom-role user with Lesson Plans granted at view level', async () => {
    const guard = makeGuard({
      customRoleId: 'r1',
      roleDoc: { moduleAccess: [{ moduleKey: 'teaching', subModuleKey: 'lesson-plans', level: 'view' }] },
    });
    await expect(guard.canActivate(contextFor(TeachingController.prototype.getLessonPlans))).resolves.toBe(true);
  });

  it('does not touch a user with no customRoleId (standard UserRole enum)', async () => {
    const guard = makeGuard({ customRoleId: null, roleDoc: null });
    await expect(guard.canActivate(contextFor(TeachingController.prototype.getLessonPlans))).resolves.toBe(true);
  });

  it('denies (manage required) a custom-role user with only view-level Lesson Plans access', async () => {
    const guard = makeGuard({
      customRoleId: 'r1',
      roleDoc: { moduleAccess: [{ moduleKey: 'teaching', subModuleKey: 'lesson-plans', level: 'view' }] },
    });
    await expect(guard.canActivate(contextFor(TeachingController.prototype.createLessonPlan)))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
