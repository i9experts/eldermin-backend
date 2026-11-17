// B0: what a guardian receives from GET /parent-portal/students/:id/behaviour.
// Fakes only (no DB). Index slots follow the ParentPortalService constructor
// (see parent-feature-access-enforcement.spec.ts): studentModel 0, reportCardModel 4,
// behaviourModel 5, tarbiyahModel 6.
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ParentPortalService } from './parent-portal.service';
import {
  PARENT_BEHAVIOUR_RECORD_FIELDS, PARENT_TARBIYAH_FIELDS, projectParentBehaviourRecord, projectParentTarbiyahAssessment,
} from './parent-behaviour.projection';

const MODEL_COUNT = 28;
const SENSITIVE_RECORD_FIELDS = [
  'witnesses', 'location', 'followUpRequired', 'followUpDate', 'followUpNote', 'resolvedNote', 'resolvedDate', 'resolved',
  'parentResponse', 'parentNotifiedBy', 'verifiedBy', 'verified', 'reportedBy', 'reportedById', 'attachments',
  'consequence', 'severity', 'actionTaken', 'campusId', 'schoolSlug', 'academicYear', 'rollNumber', 'studentName',
];

const sid = new Types.ObjectId();
const OTHER = new Types.ObjectId();

/** A fully populated record as stored by BehaviourRecord, incl. every staff-only field. */
const fullRecord = () => ({
  _id: new Types.ObjectId(), studentId: sid, studentName: 'Ali Khan', grade: '5', section: 'A', rollNumber: '12', campusId: new Types.ObjectId(),
  date: new Date('2026-09-01'), type: 'negative', category: 'bullying', title: 'Pushed a classmate', description: 'Pushed Bilal at recess',
  location: 'Playground', witnesses: ['Bilal Ahmed', 'Sara'], severity: 'high', points: -3, actionTaken: 'Warned', consequence: 'detention',
  followUpRequired: true, followUpDate: new Date(), followUpNote: 'Watch him closely; possible home issue', resolved: true,
  resolvedDate: new Date(), resolvedNote: 'Counsellor involved', parentNotified: true, parentNotifiedBy: 'Ms Noor', parentResponse: 'ok',
  reportedBy: 'Ms Noor', reportedById: new Types.ObjectId(), verifiedBy: 'Principal', verified: true,
  attachments: ['https://files/x.pdf'], schoolSlug: 'demo-school', academicYear: '2026-27',
});
const fullAssessment = () => ({
  _id: new Types.ObjectId(), studentId: sid, studentName: 'Ali Khan', grade: '5', section: 'A', campusId: new Types.ObjectId(),
  period: 'Term 1', periodType: 'termly', assessmentDate: new Date('2026-09-10'),
  traits: [{ traitKey: 'sidq', score: 4, observation: 'Honest', _internal: 'x' }], overallScore: 4, overallPercentage: 75, overallRating: 'good',
  teacherObservations: 'Doing well', areasOfStrength: ['Honesty'], areasForImprovement: ['Focus'], recommendedActions: 'Reading at home',
  assessedBy: 'Ms Noor', assessedById: new Types.ObjectId(), parentShared: true, parentSharedDate: new Date(), schoolSlug: 'demo-school', academicYear: '2026-27',
});

function chain(rows: any[]) {
  const c: any = { select: jest.fn(() => c), sort: jest.fn(() => c), limit: jest.fn(() => c), lean: () => Promise.resolve(rows) };
  return c;
}

function build(opts: { studentInSchool?: boolean; suspended?: boolean; records?: any[]; assessments?: any[]; notes?: any[] } = {}) {
  const behaviourModel = { find: jest.fn(() => chain(opts.records ?? [fullRecord()])) };
  const tarbiyahModel = { find: jest.fn(() => chain(opts.assessments ?? [fullAssessment()])) };
  const studentModel = { exists: jest.fn(() => Promise.resolve(opts.studentInSchool === false ? null : { _id: sid })) };
  const noteChain: any = { sort: () => noteChain, limit: () => noteChain, toArray: () => Promise.resolve(opts.notes ?? []) };
  const db = {
    collection: jest.fn((name: string) => name === 'behaviourNotes'
      ? { find: jest.fn(() => noteChain) }
      : { findOne: jest.fn(() => Promise.resolve({ ratingScale: { min: 1, max: 5 }, characteristics: [{ key: 'sidq', nameEn: 'Truthfulness' }], moduleDisplayName: 'Tarbiyah' })) }),
  };
  const models: any[] = Array.from({ length: MODEL_COUNT }, () => ({}));
  models[0] = studentModel; models[4] = { db }; models[5] = behaviourModel; models[6] = tarbiyahModel;
  const parentAccess: any = { checkFeature: jest.fn(() => Promise.resolve(opts.suspended ? { suspended: true, reason: 'paused' } : { suspended: false })) };
  const svc: any = new (ParentPortalService as any)(...models, {}, {}, {}, {}, parentAccess);
  return { svc, behaviourModel, tarbiyahModel, studentModel, parentAccess, db };
}

const parent = (children: any[]) => ({ role: 'parent', userId: 'p1', guardianOfStudentIds: children.map(String) });

describe('parent behaviour projection (allowlist)', () => {
  it('record allowlist excludes every staff-only field', () => {
    const out = projectParentBehaviourRecord(fullRecord());
    expect(Object.keys(out).sort()).toEqual([...PARENT_BEHAVIOUR_RECORD_FIELDS].sort());
    for (const f of SENSITIVE_RECORD_FIELDS) expect(out).not.toHaveProperty(f);
  });

  it('record allowlist covers every field the parent app reads (tarbiyah_screen.dart:172-184)', () => {
    for (const f of ['points', 'type', 'title', 'category', 'description']) expect(PARENT_BEHAVIOUR_RECORD_FIELDS).toContain(f);
  });

  it('assessment allowlist covers every field the parent app reads and drops internals', () => {
    for (const f of ['assessmentDate', 'traits', 'areasOfStrength', 'overallPercentage', 'overallScore', 'teacherObservations']) expect(PARENT_TARBIYAH_FIELDS).toContain(f);
    const out = projectParentTarbiyahAssessment(fullAssessment());
    for (const f of ['assessedBy', 'assessedById', 'campusId', 'schoolSlug', 'academicYear', 'studentName', 'parentShared', 'grade', 'section']) expect(out).not.toHaveProperty(f);
    expect(out.traits).toEqual([{ traitKey: 'sidq', score: 4, observation: 'Honest' }]);
  });

  it('a field added to the schema later is private by default', () => {
    expect(projectParentBehaviourRecord({ ...fullRecord(), brandNewInternalFlag: true })).not.toHaveProperty('brandNewInternalFlag');
  });
});

describe('ParentPortalService.getBehaviourAndTarbiyah (B0)', () => {
  it('returns only allowlisted fields on the wire and selects them in the query', async () => {
    const { svc, behaviourModel, tarbiyahModel } = build();
    const res = await svc.getBehaviourAndTarbiyah(String(sid), parent([sid]), 'demo-school');
    const rec = res.behaviourRecords[0];
    for (const f of SENSITIVE_RECORD_FIELDS) expect(rec).not.toHaveProperty(f);
    expect(rec).toMatchObject({ title: 'Pushed a classmate', points: -3, type: 'negative', category: 'bullying', description: 'Pushed Bilal at recess' });
    const sel = (behaviourModel.find.mock.results[0] as any).value.select.mock.calls[0][0] as string;
    expect(sel.split(' ').sort()).toEqual([...PARENT_BEHAVIOUR_RECORD_FIELDS].sort());
    expect(sel).not.toContain('-'); // allowlist, never an exclusion list
    const a = res.tarbiyahAssessments[0];
    expect(a).not.toHaveProperty('assessedById');
    expect(a).not.toHaveProperty('campusId');
    expect(a).toMatchObject({ overallPercentage: 75, programName: 'Tarbiyah', ratingScale: { min: 1, max: 5 } });
    expect(a.traits[0]).toMatchObject({ traitKey: 'sidq', traitName: 'Truthfulness', percentage: 75 });
    expect((tarbiyahModel.find.mock.calls as any[][])[0][0]).toMatchObject({ parentShared: true });
  });

  it("denies another guardian's student (no data lookup happens)", async () => {
    const { svc, behaviourModel, tarbiyahModel } = build();
    await expect(svc.getBehaviourAndTarbiyah(String(sid), parent([OTHER]), 'demo-school')).rejects.toThrow(ForbiddenException);
    expect(behaviourModel.find).not.toHaveBeenCalled();
    expect(tarbiyahModel.find).not.toHaveBeenCalled();
  });

  it('denies a student token for someone else and a parent with no children', async () => {
    const { svc } = build();
    await expect(svc.getBehaviourAndTarbiyah(String(sid), { role: 'student', linkedStudentId: String(OTHER) }, 'demo-school')).rejects.toThrow(ForbiddenException);
    await expect(svc.getBehaviourAndTarbiyah(String(sid), { role: 'parent', userId: 'p1' }, 'demo-school')).rejects.toThrow(ForbiddenException);
  });

  it('denies cross-school: a linked child that belongs to another school is not found, nothing is read', async () => {
    const { svc, behaviourModel, studentModel } = build({ studentInSchool: false });
    await expect(svc.getBehaviourAndTarbiyah(String(sid), parent([sid]), 'other-school')).rejects.toThrow(NotFoundException);
    expect(studentModel.exists).toHaveBeenCalledWith({ _id: sid, schoolSlug: 'other-school' });
    expect(behaviourModel.find).not.toHaveBeenCalled();
  });

  it('scopes every collection read to the school', async () => {
    const { svc, behaviourModel, tarbiyahModel } = build();
    await svc.getBehaviourAndTarbiyah(String(sid), parent([sid]), 'demo-school');
    expect((behaviourModel.find.mock.calls as any[][])[0][0]).toEqual({ studentId: sid, schoolSlug: 'demo-school' });
    expect((tarbiyahModel.find.mock.calls as any[][])[0][0]).toMatchObject({ studentId: sid, schoolSlug: 'demo-school' });
  });

  it('a suspended feature still short-circuits with the locked shape', async () => {
    const { svc, behaviourModel } = build({ suspended: true });
    expect(await svc.getBehaviourAndTarbiyah(String(sid), parent([sid]), 'demo-school')).toEqual({ suspended: true, feature: 'tarbiyah_report', reason: 'paused' });
    expect(behaviourModel.find).not.toHaveBeenCalled();
  });

  it('teacher notes (other store) still only surface when flagged parentNotified, in the fixed shape', async () => {
    const note = { _id: new Types.ObjectId(), type: 'concern', note: 'Late again', incidentDate: new Date('2026-09-02'), actionTaken: 'Spoke to him', reportedBy: new Types.ObjectId(), tenantId: new Types.ObjectId() };
    const { svc, db } = build({ notes: [note], records: [] });
    const res = await svc.getBehaviourAndTarbiyah(String(sid), parent([sid]), 'demo-school');
    const notes = db.collection.mock.results.map((r: any) => r.value).find((c: any) => c.find);
    expect(notes.find).toHaveBeenCalledWith({ studentId: sid, parentNotified: true });
    expect(res.behaviourRecords[0]).not.toHaveProperty('reportedBy');
    expect(res.behaviourRecords[0]).not.toHaveProperty('tenantId');
    expect(res.behaviourRecords[0]).toMatchObject({ source: 'teacher_note', description: 'Late again', type: 'negative' });
  });
});
