import { TeachingController } from './teaching.controller';
import { ExamController } from './exam.controller';
import { PTMController } from './ptm.controller';
import { SubstitutionController } from './substitution.controller';
import { TimetableVariantController } from './timetable-variant.controller';
import { MODULE_ACCESS_KEY } from '../../roles/decorators/require-module-access.decorator';

// Pins the fix for "a school admin sets Lesson Plans/Timetable to None for
// a teacher's custom role, but the teacher still has full access" - every
// Teaching-owned route must now carry @RequireModuleAccess so CustomRoleGuard
// (already globally registered, but previously a no-op for every Teaching
// route) actually enforces the granular grant.

function metaFor(proto: any, method: string) {
  return Reflect.getMetadata(MODULE_ACCESS_KEY, proto[method]);
}

describe('Teaching module @RequireModuleAccess coverage', () => {
  it('gates lesson plan routes on the lesson-plans sub-module', () => {
    expect(metaFor(TeachingController.prototype, 'getLessonPlans')).toEqual({ moduleKey: 'teaching', subModuleKey: 'lesson-plans', level: 'view' });
    expect(metaFor(TeachingController.prototype, 'createLessonPlan')).toEqual({ moduleKey: 'teaching', subModuleKey: 'lesson-plans', level: 'manage' });
    expect(metaFor(TeachingController.prototype, 'updateLessonPlan')).toEqual({ moduleKey: 'teaching', subModuleKey: 'lesson-plans', level: 'manage' });
  });

  it('gates timetable routes (including exams, electives, duty-roster, rooms, period-templates, variants) on the timetable sub-module', () => {
    expect(metaFor(TeachingController.prototype, 'getTimetables')).toEqual({ moduleKey: 'teaching', subModuleKey: 'timetable', level: 'view' });
    expect(metaFor(TeachingController.prototype, 'createTimetable')).toEqual({ moduleKey: 'teaching', subModuleKey: 'timetable', level: 'manage' });
    expect(metaFor(ExamController.prototype, 'getExams')).toEqual({ moduleKey: 'teaching', subModuleKey: 'timetable', level: 'view' });
    expect(metaFor(TimetableVariantController.prototype, 'getVariants')).toEqual({ moduleKey: 'teaching', subModuleKey: 'timetable', level: 'view' });
  });

  it('gates fixtures/substitution routes on the fixtures sub-module', () => {
    expect(metaFor(SubstitutionController.prototype, 'getFixtures')).toEqual({ moduleKey: 'teaching', subModuleKey: 'fixtures', level: 'view' });
    expect(metaFor(SubstitutionController.prototype, 'assign')).toEqual({ moduleKey: 'teaching', subModuleKey: 'fixtures', level: 'manage' });
  });

  it('gates PTM routes on the ptm sub-module', () => {
    expect(metaFor(PTMController.prototype, 'getMeetings')).toEqual({ moduleKey: 'teaching', subModuleKey: 'ptm', level: 'view' });
    expect(metaFor(PTMController.prototype, 'create')).toEqual({ moduleKey: 'teaching', subModuleKey: 'ptm', level: 'manage' });
  });

  it('gates assignment (Homework tab) routes on the homework sub-module', () => {
    expect(metaFor(TeachingController.prototype, 'getAssignments')).toEqual({ moduleKey: 'teaching', subModuleKey: 'homework', level: 'view' });
    expect(metaFor(TeachingController.prototype, 'createAssignment')).toEqual({ moduleKey: 'teaching', subModuleKey: 'homework', level: 'manage' });
  });

  it('gates class diary routes on the class-diary sub-module', () => {
    expect(metaFor(TeachingController.prototype, 'getClassDiaryEntries')).toEqual({ moduleKey: 'teaching', subModuleKey: 'class-diary', level: 'view' });
    expect(metaFor(TeachingController.prototype, 'createClassDiaryEntry')).toEqual({ moduleKey: 'teaching', subModuleKey: 'class-diary', level: 'manage' });
  });

  it('gates behaviour/complaints routes on the behaviour sub-module', () => {
    expect(metaFor(TeachingController.prototype, 'getBehaviour')).toEqual({ moduleKey: 'teaching', subModuleKey: 'behaviour', level: 'view' });
    expect(metaFor(TeachingController.prototype, 'listComplaints')).toEqual({ moduleKey: 'teaching', subModuleKey: 'behaviour', level: 'view' });
  });

  it('gates the teacher directory and dashboard', () => {
    expect(metaFor(TeachingController.prototype, 'getDashboard')).toEqual({ moduleKey: 'teaching', subModuleKey: 'dashboard', level: 'view' });
    expect(metaFor(TeachingController.prototype, 'getTeachers')).toEqual({ moduleKey: 'teaching', subModuleKey: 'teachers', level: 'view' });
    expect(metaFor(TeachingController.prototype, 'createTeacher')).toEqual({ moduleKey: 'teaching', subModuleKey: 'teachers', level: 'manage' });
  });

  it('gates attendance-settings routes', () => {
    expect(metaFor(TeachingController.prototype, 'getAttendanceSettings')).toEqual({ moduleKey: 'teaching', subModuleKey: 'attendance-settings', level: 'view' });
    expect(metaFor(TeachingController.prototype, 'updateAttendanceSettings')).toEqual({ moduleKey: 'teaching', subModuleKey: 'attendance-settings', level: 'manage' });
  });
});
