import { Types } from 'mongoose';
import { AssessmentService } from './assessment.service';

// Fakes only (no DB) shared by the assessments teacher-fix specs.
export const oid = () => new Types.ObjectId();
export const chain = (v: any) => {
  const c: any = { lean: () => Promise.resolve(v), select: () => c, sort: () => c, then: (r: any, j: any) => Promise.resolve(v).then(r, j) };
  return c;
};

export const me = { userId: oid().toString(), staffId: oid(), profileId: oid() };
export const teacherUser = (over: any = {}) => ({ userId: me.userId, role: 'teacher', name: 'Ms Me', schoolSlug: 's', ...over });

export interface FakeOpts {
  staff?: any;           // Staff row for the caller (undefined => default, null => none)
  profile?: any;         // TeacherProfile row
  assessment?: any;
  existingMarks?: any[]; // verified-lookup result for markModel.find
  reportCard?: any;
  attempt?: any;         // quiz attempt doc (for findOne)
  attempts?: any[];      // quiz attempts for find()
  students?: any;
  studentRows?: any[];   // studentModel.find() result (section fallback for attempts without one)
  existingMarkEntry?: any;
  questions?: any[];
  paper?: any;
}

export function makeAssessmentService(o: FakeOpts = {}) {
  const staff = 'staff' in o ? o.staff : { _id: me.staffId, firstName: 'Ms', lastName: 'Me' };
  const profile = 'profile' in o ? o.profile : { _id: me.profileId, isClassTeacher: false, currentAssignments: [] };
  const staffModel: any = { findOne: jest.fn(() => chain(staff)) };
  const teacherProfileModel: any = { findOne: jest.fn(() => chain(profile)) };
  const assessmentModel: any = { findById: jest.fn(async () => o.assessment ?? null) };
  const markModel: any = {
    find: jest.fn(() => chain(o.existingMarks ?? [])),
    findOne: jest.fn(() => chain(o.existingMarkEntry ?? null)),
    bulkWrite: jest.fn(async () => ({})),
    updateOne: jest.fn(async () => ({})),
  };
  const reportCardModel: any = {
    findOne: jest.fn(() => chain(o.reportCard ?? null)),
    findOneAndUpdate: jest.fn(() => chain(o.reportCard ?? null)),
  };
  const quizAttemptModel: any = {
    find: jest.fn(() => chain(o.attempts ?? [])),
    findOne: jest.fn(() => {
      const a = o.attempt ?? null;
      const c: any = chain(a);
      c.then = (r: any, j: any) => Promise.resolve(a).then(r, j);
      return c;
    }),
  };
  const examPaperModel: any = { findOne: jest.fn(() => chain(o.paper ?? null)) };
  const questionModel: any = { find: jest.fn(() => chain(o.questions ?? [])) };
  const studentModel: any = { findOne: jest.fn(() => chain(o.students ?? null)), findById: jest.fn(() => chain(o.students ?? null)), find: jest.fn(() => chain(o.studentRows ?? [])) };
  const noop: any = {};
  const service = new AssessmentService(
    assessmentModel, questionModel, markModel, reportCardModel, examPaperModel, noop, quizAttemptModel,
    studentModel, noop, noop, noop, staffModel, teacherProfileModel, noop, noop, noop,
  );
  return { service, studentModel, assessmentModel, markModel, reportCardModel, quizAttemptModel, staffModel, teacherProfileModel, examPaperModel, questionModel };
}
