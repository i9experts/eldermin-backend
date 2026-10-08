import { Types } from 'mongoose';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { PTMController } from '../modules/teaching/ptm.controller';
import {
  isTeacherDeniedKey, projectForTeacher, stripTeacherSensitive, TEACHER_STUDENT_SELECT,
} from './teacher-student-projection.util';

// Fakes only, no DB. B5: teacher field projection; every other role unchanged.

const sid = new Types.ObjectId();
const guardian = () => ({
  name: 'Mr Khan', relation: 'father', isPrimary: true, isEmergencyContact: true, email: 'khan@example.com',
  cnic: '42101-1234567-1', phone: '03001234567', occupation: 'Engineer', employer: 'ACME', monthlyIncome: 250000,
  mobile: '0300', whatsapp: '0300', whatsApp: '0300', landline: '021', income: 1,
});
const studentDoc = () => ({
  _id: sid, studentId: 'STU-1', firstName: 'Ali', lastName: 'Khan', preferredName: 'Ally', gender: 'male', photo: 'u',
  currentGrade: 'Grade 5', currentSection: 'A', currentRollNumber: '7', grNo: 'G1', status: 'active', currentAcademicYear: '2025-26',
  dateOfBirth: new Date('2015-01-01'), address: 'House 1',
  nationalId: '42101-0000000-0', bForm: '42101-7654321-0', passportNumber: 'AB123', visaNo: 'V1', cnic: 'x',
  personalPhone: '1', whatsApp: '2', altPhone: '3', emergencyContactPhone: '4', tutorPhone: '5',
  scholarshipHolder: true, scholarshipDetail: '50%', monthlyTuitionFee: 5000, feeStatus: 'overdue', monthlyFeeArrears: 9000,
  guardians: [guardian(), { ...guardian(), name: 'Mrs Khan', relation: 'mother', isPrimary: false }],
  medical: { allergies: ['peanuts'], bloodGroup: 'A+', doctorPhone: '021-1' },
  customFields: { feeStructure: 'gold', invoices: [{ amount: 1 }], nested: { guardianPhone: '9', keep: 'yes' } },
});
const payload360 = () => ({
  student: studentDoc(),
  attendance: { summary: { present: 3 }, totalDays: 3, presentDays: 3, percentage: 100, recent: [{ date: new Date(), status: 'present' }] },
  fees: { summary: { paid: { count: 1, total: 100 } }, recent: [{ amount: 100, netAmount: 90, discount: 10, paidAmount: 90, balance: 0, status: 'paid' }] },
  behaviour: { summary: {}, totalPoints: 2, recent: [{ type: 'positive', points: 2 }] },
  assessments: { recent: [{ assessmentTitle: 'Mid', percentage: 80 }] },
});
const list = () => ({ data: [studentDoc(), studentDoc()], meta: { total: 2, page: 1, limit: 20, pages: 1 } });
const ptm = () => ([{ _id: sid, studentName: 'Ali Khan', guardianName: 'Mr Khan', guardianPhone: '0300', guardianEmail: 'khan@example.com', status: 'confirmed' }]);

const SENSITIVE_KEYS = [
  'nationalId', 'bForm', 'passportNumber', 'visaNo', 'cnic', 'personalPhone', 'whatsApp', 'whatsapp', 'altPhone', 'emergencyContactPhone',
  'tutorPhone', 'phone', 'mobile', 'landline', 'doctorPhone', 'guardianPhone', 'scholarshipHolder', 'scholarshipDetail',
  'monthlyTuitionFee', 'feeStatus', 'monthlyFeeArrears', 'feeStructure', 'invoices', 'monthlyIncome', 'income', 'employer', 'occupation',
  'fees', 'netAmount', 'discount', 'paidAmount', 'balance',
];
function keysDeep(v: any, acc = new Set<string>()): Set<string> {
  if (v === null || typeof v !== 'object' || v instanceof Date || (v as any)._bsontype) return acc;
  if (Array.isArray(v)) { v.forEach(x => keysDeep(x, acc)); return acc; }
  for (const [k, val] of Object.entries(v)) { acc.add(k); keysDeep(val, acc); }
  return acc;
}
const expectClean = (v: any) => {
  const ks = keysDeep(v);
  for (const bad of SENSITIVE_KEYS) expect(ks.has(bad)).toBe(false);
};

const teacherU = { role: 'teacher', userId: 'u1', schoolSlug: 's', campusId: 'c1' };
const OTHER_ROLES = ['principal', 'admin', 'institution_owner', 'vice_principal', 'academic_coordinator', 'super_admin', 'hr_manager'];

function makeController(result: any) {
  const svc: any = {};
  for (const m of ['getStudents', 'getDistinctGradesSections', 'getClassRosterDiagnostic', 'getStudentById', 'getStudent360',
    'getStudentLearning', 'getAttendance', 'getStudentAttendanceSummary', 'getAllGuardians', 'getFees', 'getFeeStatement']) {
    svc[m] = jest.fn(async () => result);
  }
  return { ctrl: new StudentsController(svc as StudentsService), svc };
}
const reqOf = (user: any) => ({ user, headers: {} });

describe('B5 deny-list helper', () => {
  it('flags the documented keys and passes the teacher-needed ones', () => {
    for (const k of SENSITIVE_KEYS) expect(isTeacherDeniedKey(k)).toBe(true);
    for (const k of ['name', 'relation', 'isPrimary', 'email', 'firstName', 'currentGrade', 'allergies', 'percentage', 'feedback', 'status', 'points']) {
      expect(isTeacherDeniedKey(k)).toBe(false);
    }
  });
  it('strips deeply (nested guardians[], arrays, customFields) and leaves ObjectId/Date leaves intact', () => {
    const out: any = stripTeacherSensitive(payload360());
    expectClean(out);
    expect(out.student._id).toBe(sid);
    expect(out.student.dateOfBirth).toBeInstanceOf(Date);
    expect(out.student.customFields.nested).toEqual({ keep: 'yes' });
  });
  it('does not mutate its input', () => {
    const p = payload360(); const before = JSON.stringify(p);
    stripTeacherSensitive(p);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('projectForTeacher returns the SAME object for non-teachers', () => {
    const p = payload360();
    for (const r of OTHER_ROLES) expect(projectForTeacher({ role: r }, p)).toBe(p);
    expect(projectForTeacher(undefined, p)).toBe(p);
  });
});

describe('B5 StudentsController: teacher projection per endpoint', () => {
  const cases: Array<[string, (c: StudentsController, r: any) => Promise<any>, () => any]> = [
    ['GET /students', (c, r) => c.getStudents(r, {} as any), list],
    ['GET /students/:id', (c, r) => c.getStudent(sid.toString(), r), studentDoc],
    ['GET /students/:id/360', (c, r) => c.getStudent360(sid.toString(), r), payload360],
    ['GET /students/filters/grades-sections', (c, r) => c.getDistinctGradesSections(r), () => ({ grades: ['Grade 5'], sections: ['A'], ...{ phone: 'x' } })],
    ['GET /students/class-roster-diagnostic', (c, r) => c.getClassRosterDiagnostic(r, 'Grade 5', 'A'), () => ({ totalInClass: 3, balance: 1 })],
    ['GET /students/:id/learning', (c, r) => c.getStudentLearning(sid.toString(), r), () => ({ courses: [], quizzes: { recent: [{ subject: 'Math', income: 1 }] } })],
    ['GET /students/:id/attendance/summary', (c, r) => c.getAttendanceSummary(sid.toString(), r), () => [{ _id: 'present', count: 3, phone: 'x' }]],
    ['GET /students/attendance/list', (c, r) => c.getAttendance(r, {} as any), () => ({ data: [{ studentId: sid, status: 'present', guardians: [guardian()] }], meta: {} })],
    ['GET /students/guardians/list', (c, r) => c.getGuardians(sid.toString(), 'x', r), () => [guardian()]],
  ];
  for (const [label, call, make] of cases) {
    it(`${label}: teacher response has no sensitive key`, async () => {
      const { ctrl } = makeController(make());
      const res = await call(ctrl, reqOf(teacherU));
      expectClean(res);
    });
    it(`${label}: every other role gets the service payload unchanged (same object)`, async () => {
      for (const role of OTHER_ROLES) {
        const payload = make();
        const { ctrl } = makeController(payload);
        const res = await call(ctrl, reqOf({ role, userId: 'u', schoolSlug: 's' }));
        expect(res).toBe(payload);
        expect(JSON.stringify(res)).toBe(JSON.stringify(payload));
      }
    });
  }

  it('teacher-needed fields survive in list and 360', async () => {
    const { ctrl } = makeController(payload360());
    const res: any = await ctrl.getStudent360(sid.toString(), reqOf(teacherU));
    expect(res.student.firstName).toBe('Ali');
    expect(res.student.currentGrade).toBe('Grade 5');
    expect(res.student.currentRollNumber).toBe('7');
    expect(res.student.guardians.map((g: any) => [g.name, g.relation, g.isPrimary])).toEqual([['Mr Khan', 'father', true], ['Mrs Khan', 'mother', false]]);
    expect(res.student.medical.allergies).toEqual(['peanuts']);
    expect(res.attendance.percentage).toBe(100);
    expect(res.attendance.recent[0].status).toBe('present');
    expect(res.behaviour.totalPoints).toBe(2);
    expect(res.behaviour.recent[0].type).toBe('positive');
    expect(res.assessments.recent[0].assessmentTitle).toBe('Mid');
    expect(res.fees).toBeUndefined();
    const l: any = await makeController(list()).ctrl.getStudents(reqOf(teacherU), {} as any);
    expect(l.data[0].firstName).toBe('Ali');
    expect(l.data[0]._id).toBe(sid);
    expect(l.meta.total).toBe(2);
  });

  it('fees list and fee statement: teacher 403, others pass through', async () => {
    const { ctrl } = makeController({ fees: [] });
    await expect(ctrl.getFees(reqOf(teacherU), {} as any)).rejects.toThrow(/not available to the teacher/);
    await expect(ctrl.getFeeStatement(sid.toString(), reqOf(teacherU))).rejects.toThrow(/not available to the teacher/);
    for (const role of OTHER_ROLES) {
      await expect(ctrl.getFees(reqOf({ role, schoolSlug: 's' }), {} as any)).resolves.toEqual({ fees: [] });
      await expect(ctrl.getFeeStatement(sid.toString(), reqOf({ role, schoolSlug: 's' }))).resolves.toEqual({ fees: [] });
    }
  });

  it('service receives requestingUser for 360 (so it can skip fee reads)', async () => {
    const { ctrl, svc } = makeController(payload360());
    await ctrl.getStudent360(sid.toString(), reqOf(teacherU));
    expect(svc.getStudent360).toHaveBeenCalledWith(sid.toString(), 's', teacherU);
  });
});

describe('B5 PTM controller embeds guardian contact', () => {
  const mk = (data: any) => new PTMController({
    getMeetings: jest.fn(async () => data), getUpcomingForTeacher: jest.fn(async () => data),
    getStudentHistory: jest.fn(async () => data), getMeetingById: jest.fn(async () => data[0]),
  } as any);
  it('teacher: guardianPhone removed, guardianName/guardianEmail kept', async () => {
    const c = mk(ptm());
    const u = { ...teacherU, tenantId: new Types.ObjectId().toString() };
    for (const res of [await c.getMeetings({ user: u }, {}), await c.getMyUpcoming('t', { user: u }), await c.getStudentHistory('s', { user: u })] as any[]) {
      expect(res[0].guardianPhone).toBeUndefined();
      expect(res[0].guardianName).toBe('Mr Khan');
      expect(res[0].status).toBe('confirmed');
    }
    expect(((await c.getById('x', { user: u })) as any).guardianPhone).toBeUndefined();
  });
  it('other roles unchanged', async () => {
    for (const role of OTHER_ROLES) {
      const data = ptm(); const c = mk(data);
      const res: any = await c.getMeetings({ user: { role, tenantId: 't' } }, {});
      expect(res).toBe(data);
      expect(res[0].guardianPhone).toBe('0300');
    }
  });
});

// ---- service-level: DB-side projection + no fee reads for teacher -------------------------
const chain = (v: any, sink?: any) => {
  const c: any = {
    select: (s: any) => { if (sink) sink.select = s; return c; }, sort: () => c, skip: () => c, limit: () => c, lean: () => Promise.resolve(v),
    then: (r: any, j: any) => Promise.resolve(v).then(r, j),
  };
  return c;
};
function makeService() {
  const sink: any = {};
  const docs = [studentDoc()];
  const studentModel: any = {
    find: jest.fn((f: any) => { sink.filter = f; return chain(docs, sink); }),
    findOne: jest.fn(() => chain(studentDoc(), sink)),
    countDocuments: jest.fn(async () => 1),
  };
  const feeModel: any = { aggregate: jest.fn(async () => []), find: jest.fn(() => chain([])) };
  const attendanceModel: any = { aggregate: jest.fn(async () => []), find: jest.fn(() => chain([])) };
  const behaviourModel: any = { aggregate: jest.fn(async () => []), find: jest.fn(() => chain([])) };
  const resultModel: any = { find: jest.fn(() => chain([])) };
  const feeStructureModel: any = { find: jest.fn(() => chain([])) };
  const assignModel: any = { find: jest.fn(() => chain([])) };
  const n: any = {};
  const svc = new StudentsService(studentModel, attendanceModel, feeModel, behaviourModel, resultModel, n, n, n, n,
    feeStructureModel, assignModel, n, n, n, n, n, n, n, n, n);
  return { svc, sink, studentModel, feeModel, feeStructureModel, assignModel };
}

describe('B5 StudentsService: teacher reads', () => {
  const q: any = { page: 1, limit: 20, search: '0300' };
  it('getStudents (teacher): exclusion select, no fee lookups, no monthlyTuitionFee, no guardian phone search', async () => {
    const { svc, sink, feeStructureModel, assignModel } = makeService();
    const res: any = await svc.getStudents('s', q, teacherU as any);
    expect(sink.select).toBe(TEACHER_STUDENT_SELECT);
    expect(feeStructureModel.find).not.toHaveBeenCalled();
    expect(assignModel.find).not.toHaveBeenCalled();
    expectClean(res);
    expect(res.data[0].firstName).toBe('Ali');
    expect(JSON.stringify(sink.filter.$or)).not.toContain('guardians.phone');
  });
  it.each(OTHER_ROLES)('getStudents (%s): unchanged (fee lookups run, tuition key present, phone search kept, no select)', async (role) => {
    const { svc, sink, feeStructureModel } = makeService();
    const res: any = await svc.getStudents('s', q, { role, schoolSlug: 's', userId: 'u', campusId: 'c1' } as any);
    expect(sink.select).toBeUndefined();
    expect(feeStructureModel.find).toHaveBeenCalled();
    expect('monthlyTuitionFee' in res.data[0]).toBe(true);
    expect(res.data[0].guardians[0].phone).toBe('03001234567');
    expect(JSON.stringify(sink.filter.$or)).toContain('guardians.phone');
  });
  it('getStudent360 (teacher): fee collection never read, exclusion select', async () => {
    const { svc, sink, feeModel } = makeService();
    const res: any = await svc.getStudent360(sid.toString(), 's', teacherU as any);
    expect(sink.select).toBe(TEACHER_STUDENT_SELECT);
    expect(feeModel.aggregate).not.toHaveBeenCalled();
    expect(feeModel.find).not.toHaveBeenCalled();
    expect(res.student.firstName).toBe('Ali');
  });
  it.each(OTHER_ROLES)('getStudent360 (%s): fee collection still read, no select', async (role) => {
    const { svc, sink, feeModel } = makeService();
    await svc.getStudent360(sid.toString(), 's', { role, schoolSlug: 's' } as any);
    expect(sink.select).toBeUndefined();
    expect(feeModel.aggregate).toHaveBeenCalled();
    expect(feeModel.find).toHaveBeenCalled();
  });
  it('getStudent360 without a user (legacy callers): unchanged', async () => {
    const { svc, feeModel } = makeService();
    await svc.getStudent360(sid.toString(), 's');
    expect(feeModel.aggregate).toHaveBeenCalled();
  });
});
