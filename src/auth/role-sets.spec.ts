import { PERMISSION_KEY } from './decorators';
import { ROLES_OR_MODULE_KEY } from '../roles/decorators/roles-or-module-manage.decorator';
import { ROLES_KEY } from './decorators';
import { UserRole } from './roles.enum';
import { TEACHING_ADMIN_ROLES, HR_LEAVE_ADMIN_ROLES, MODULES_ADMIN_ROLES, STAFF_WRITE_ROLES } from './role-sets';
import { AssessmentController } from '../assessments/assessment.controller';
import { BehaviourController } from '../behaviour/behaviour.controller';
import { EceController } from '../ece/ece.controller';
import { HrController } from '../modules/hr/hr.controller';
import { ModulesController } from '../modules/modules.controller';
import { PTMController } from '../modules/teaching/ptm.controller';
import { StudentsController } from '../students/students.controller';
import { SubstitutionController } from '../modules/teaching/substitution.controller';
import { SyllabusController } from '../syllabus/syllabus.controller';
import { TeachingController } from '../modules/teaching/teaching.controller';
import { TimetableVariantController } from '../modules/teaching/timetable-variant.controller';

const SETS: Record<string, UserRole[]> = {
  TEACHING_ADMIN_ROLES, HR_LEAVE_ADMIN_ROLES, MODULES_ADMIN_ROLES, STAFF_WRITE_ROLES,
};

// [controller, handler, role-set name, route label]
const GUARDED: Array<[any, string, string, string]> = [
  [AssessmentController, 'updateRemarks', 'STAFF_WRITE_ROLES', 'PATCH /report-cards/:id/remarks'],
  [AssessmentController, 'gradeQuizAttempt', 'STAFF_WRITE_ROLES', 'POST /quiz-attempts/:attemptId/grade'],
  [AssessmentController, 'bulkEnterMarks', 'STAFF_WRITE_ROLES', 'POST /marks/bulk'],
  [SyllabusController, 'remove', 'TEACHING_ADMIN_ROLES', 'DELETE /:id'],
  [SyllabusController, 'approve', 'TEACHING_ADMIN_ROLES', 'PATCH /:id/approve'],
  [SyllabusController, 'markTopic', 'STAFF_WRITE_ROLES', 'PATCH /:id/mark-topic'],
  [SyllabusController, 'markSubTopic', 'STAFF_WRITE_ROLES', 'PATCH /:id/mark-sub-topic'],
  [SyllabusController, 'addLesson', 'STAFF_WRITE_ROLES', 'POST /:id/lessons'],
  [SyllabusController, 'updateLesson', 'STAFF_WRITE_ROLES', 'PATCH /:id/lessons'],
  [SyllabusController, 'deleteLesson', 'STAFF_WRITE_ROLES', 'DELETE /:id/lessons'],
  [SyllabusController, 'setPublished', 'STAFF_WRITE_ROLES', 'PATCH /:id/publish'],
  [StudentsController, 'markAttendance', 'STAFF_WRITE_ROLES', 'POST /attendance'],
  [StudentsController, 'bulkMarkAttendance', 'STAFF_WRITE_ROLES', 'POST /attendance/bulk'],
  [BehaviourController, 'createRecord', 'STAFF_WRITE_ROLES', 'POST /records'],
  [BehaviourController, 'updateRecord', 'STAFF_WRITE_ROLES', 'PUT /records/:id'],
  [BehaviourController, 'createTarbiyah', 'STAFF_WRITE_ROLES', 'POST /tarbiyah'],
  [BehaviourController, 'updateTarbiyah', 'STAFF_WRITE_ROLES', 'PUT /tarbiyah/:id'],
  [ModulesController, 'activate', 'MODULES_ADMIN_ROLES', 'POST /:moduleId/activate'],
  [ModulesController, 'deactivate', 'MODULES_ADMIN_ROLES', 'POST /:moduleId/deactivate'],
  [ModulesController, 'bulkActivate', 'MODULES_ADMIN_ROLES', 'POST /bulk-activate'],
  [ModulesController, 'activateAll', 'MODULES_ADMIN_ROLES', 'POST /activate-all'],
  [TimetableVariantController, 'generate', 'TEACHING_ADMIN_ROLES', 'POST /generate'],
  [TimetableVariantController, 'publish', 'TEACHING_ADMIN_ROLES', 'POST /:id/publish'],
  [TimetableVariantController, 'deleteVariant', 'TEACHING_ADMIN_ROLES', 'DELETE /:id'],
  [SubstitutionController, 'complete', 'STAFF_WRITE_ROLES', 'PATCH /:id/complete'],
  [PTMController, 'create', 'STAFF_WRITE_ROLES', 'POST /'],
  [PTMController, 'confirm', 'STAFF_WRITE_ROLES', 'PATCH /:id/confirm'],
  [PTMController, 'reschedule', 'STAFF_WRITE_ROLES', 'PATCH /:id/reschedule'],
  [PTMController, 'recordOutcome', 'STAFF_WRITE_ROLES', 'PATCH /:id/outcome'],
  [PTMController, 'updateActionItem', 'STAFF_WRITE_ROLES', 'PATCH /:id/action-items/:actionItemId'],
  [PTMController, 'cancel', 'STAFF_WRITE_ROLES', 'PATCH /:id/cancel'],
  [TeachingController, 'syncTeachers', 'TEACHING_ADMIN_ROLES', 'POST /teachers/sync'],
  [TeachingController, 'createTeacher', 'TEACHING_ADMIN_ROLES', 'POST /teachers'],
  [TeachingController, 'updateTeacher', 'TEACHING_ADMIN_ROLES', 'PATCH /teachers/:id'],
  [TeachingController, 'deleteTeacher', 'TEACHING_ADMIN_ROLES', 'DELETE /teachers/:id'],
  [TeachingController, 'approvePlan', 'TEACHING_ADMIN_ROLES', 'PATCH /lesson-plans/:id/approve'],
  [TeachingController, 'rejectPlan', 'TEACHING_ADMIN_ROLES', 'PATCH /lesson-plans/:id/reject'],
  [TeachingController, 'createLessonPlan', 'STAFF_WRITE_ROLES', 'POST /lesson-plans'],
  [TeachingController, 'parseLessonPlanUpload', 'STAFF_WRITE_ROLES', 'POST /lesson-plans/parse-upload'],
  [TeachingController, 'updateLessonPlan', 'STAFF_WRITE_ROLES', 'PATCH /lesson-plans/:id'],
  [TeachingController, 'createTimetable', 'TEACHING_ADMIN_ROLES', 'POST /timetable'],
  [TeachingController, 'updateTimetable', 'TEACHING_ADMIN_ROLES', 'PATCH /timetable/:id'],
  [TeachingController, 'deleteTimetable', 'TEACHING_ADMIN_ROLES', 'DELETE /timetable/:id'],
  [TeachingController, 'createElectiveGroup', 'TEACHING_ADMIN_ROLES', 'POST /electives'],
  [TeachingController, 'updateElectiveGroup', 'TEACHING_ADMIN_ROLES', 'PATCH /electives/:id'],
  [TeachingController, 'deleteElectiveGroup', 'TEACHING_ADMIN_ROLES', 'DELETE /electives/:id'],
  [TeachingController, 'createDutyRoster', 'TEACHING_ADMIN_ROLES', 'POST /duty-roster'],
  [TeachingController, 'updateDutyRoster', 'TEACHING_ADMIN_ROLES', 'PATCH /duty-roster/:id'],
  [TeachingController, 'deleteDutyRoster', 'TEACHING_ADMIN_ROLES', 'DELETE /duty-roster/:id'],
  [TeachingController, 'createRoom', 'TEACHING_ADMIN_ROLES', 'POST /rooms'],
  [TeachingController, 'updateRoom', 'TEACHING_ADMIN_ROLES', 'PATCH /rooms/:id'],
  [TeachingController, 'deleteRoom', 'TEACHING_ADMIN_ROLES', 'DELETE /rooms/:id'],
  [TeachingController, 'createPeriodTemplate', 'TEACHING_ADMIN_ROLES', 'POST /period-templates'],
  [TeachingController, 'seedDefaultPeriodTemplate', 'TEACHING_ADMIN_ROLES', 'POST /period-templates/seed-default'],
  [TeachingController, 'updatePeriodTemplate', 'TEACHING_ADMIN_ROLES', 'PATCH /period-templates/:id'],
  [TeachingController, 'deletePeriodTemplate', 'TEACHING_ADMIN_ROLES', 'DELETE /period-templates/:id'],
  [TeachingController, 'createAssignment', 'STAFF_WRITE_ROLES', 'POST /assignments'],
  [TeachingController, 'updateAssignment', 'STAFF_WRITE_ROLES', 'PATCH /assignments/:id'],
  [TeachingController, 'deleteAssignment', 'STAFF_WRITE_ROLES', 'DELETE /assignments/:id'],
  [TeachingController, 'gradeSubmission', 'STAFF_WRITE_ROLES', 'PATCH /assignments/:id/submissions/:submissionId'],
  [TeachingController, 'createBehaviour', 'STAFF_WRITE_ROLES', 'POST /behaviour'],
  [TeachingController, 'updateBehaviour', 'STAFF_WRITE_ROLES', 'PATCH /behaviour/:id'],
  [HrController, 'submitLeaveApplication', 'HR_LEAVE_ADMIN_ROLES', 'POST /leave/applications'],
  [HrController, 'allocateLeaveBalances', 'HR_LEAVE_ADMIN_ROLES', 'POST /leave/balances/allocate'],
  [HrController, 'seedLeavePolicies', 'HR_LEAVE_ADMIN_ROLES', 'POST /leave/policies/seed-defaults'],
  [HrController, 'createLeavePolicy', 'HR_LEAVE_ADMIN_ROLES', 'POST /leave/policies'],
  [HrController, 'updateLeavePolicy', 'HR_LEAVE_ADMIN_ROLES', 'PATCH /leave/policies/:id'],
  [HrController, 'assignLeavePolicy', 'HR_LEAVE_ADMIN_ROLES', 'POST /leave/policies/:id/assign'],
  [HrController, 'bulkAssignLeavePolicy', 'HR_LEAVE_ADMIN_ROLES', 'POST /leave/policies/:id/bulk-assign'],
  [HrController, 'createLeave', 'HR_LEAVE_ADMIN_ROLES', 'POST /leave'],
  [HrController, 'updateLeaveStatus', 'HR_LEAVE_ADMIN_ROLES', 'PATCH /leave/:id/status'],
  [EceController, 'createObservation', 'STAFF_WRITE_ROLES', 'POST /observations'],
  [EceController, 'quickObserve', 'STAFF_WRITE_ROLES', 'POST /observations/quick'],
  [EceController, 'createPortfolioEntry', 'STAFF_WRITE_ROLES', 'POST /portfolio'],
  [EceController, 'shareEntry', 'STAFF_WRITE_ROLES', 'PATCH /portfolio/:id/share'],
  [EceController, 'upsertWeeklyPlan', 'STAFF_WRITE_ROLES', 'PUT /weekly-plan'],
];

describe('role-sets', () => {
  it('has the specified membership', () => {
    expect(TEACHING_ADMIN_ROLES).toEqual([
      UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
      UserRole.VICE_PRINCIPAL, UserRole.ADMIN, UserRole.ACADEMIC_COORDINATOR,
    ]);
    expect(HR_LEAVE_ADMIN_ROLES).toContain(UserRole.HR_MANAGER);
    expect(MODULES_ADMIN_ROLES).toContain(UserRole.PRINCIPAL);
    expect(STAFF_WRITE_ROLES).toContain(UserRole.TEACHER);
  });

  describe.each(GUARDED)('%p.%s (%s) %s', (Ctrl, fn, setName) => {
    const meta = Reflect.getMetadata(ROLES_OR_MODULE_KEY, Ctrl.prototype[fn]);
    const roles: UserRole[] | undefined = meta?.roles;

    it('carries the expected @RolesOrModuleManage set and no legacy @Roles', () => {
      expect(meta).toBeDefined();
      expect(Reflect.getMetadata(ROLES_KEY, Ctrl.prototype[fn])).toBeUndefined();
      expect(roles).toBeDefined();
      expect([...(roles as UserRole[])].sort()).toEqual([...SETS[setName]].sort());
    });
    it('excludes parent and student', () => {
      expect(roles).not.toContain(UserRole.PARENT);
      expect(roles).not.toContain(UserRole.STUDENT);
    });
    it('module wide grants only on staff-write routes', () => {
      expect(meta.allowModuleWide).toBe(setName === 'STAFF_WRITE_ROLES');
      expect(meta.level).toBe(Ctrl === HrController && fn === 'updateLeaveStatus' ? 'view' : 'manage');
    });
    it('teacher access matches tier', () => {
      if (setName === 'STAFF_WRITE_ROLES') expect(roles).toContain(UserRole.TEACHER);
      else expect(roles).not.toContain(UserRole.TEACHER);
    });
  });

  describe('leave/self handlers are untouched', () => {
    it.each(['getMyLeaveBalance', 'getMyLeaveHistory', 'createMyLeave'])('%s', (fn) => {
      expect(Reflect.getMetadata(ROLES_KEY, HrController.prototype[fn as keyof HrController])).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, HrController.prototype[fn as keyof HrController])).toBeUndefined();
      expect(Reflect.getMetadata(PERMISSION_KEY, HrController.prototype[fn as keyof HrController])).toBe('leave:self');
    });
  });
});
