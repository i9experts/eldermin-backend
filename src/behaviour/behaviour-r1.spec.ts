import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BehaviourService } from './behaviour.service';
import { customRoleIsElevated } from './behaviour-access';

// R1: owner decisions D2 (coordinator edits any Tarbiyah of their school/campus, last editor stamped) and the custom-role rule
// (a custom role holding the behaviour MANAGE grant, module-wide or for the sub-module, edits others' records like an admin).

const ME = new Types.ObjectId().toHexString(), OTHER = new Types.ObjectId().toHexString(), ID = new Types.ObjectId().toHexString();
const CAMPUS_A = new Types.ObjectId(), CAMPUS_B = new Types.ObjectId();
const enforce: any = (extra: any = {}) => ({ mode: 'enforce', enforce: true, role: 'teacher', isTeacher: true, elevated: false, route: '/x', method: 'PUT', ...extra });

function tarbiyahSvc(existing: any) {
  const sets: any[] = [];
  const s: any = Object.create(BehaviourService.prototype);
  s.tarbiyahModel = {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => existing }) })),
    findOneAndUpdate: jest.fn(async (_f: any, u: any) => { sets.push(u.$set); return { ...existing, ...u.$set, studentId: 's' }; }),
    db: {},
  };
  s.getCharacterSettings = async () => ({ ratingScale: { min: 1, max: 5 } });
  return { s: s as BehaviourService, sets };
}
function recordSvc(existing: any) {
  const sets: any[] = [];
  const s: any = Object.create(BehaviourService.prototype);
  s.recordModel = {
    findOne: jest.fn(() => ({ lean: async () => existing })),
    findOneAndUpdate: jest.fn(async (_f: any, u: any) => { sets.push(u.$set); return { ...existing, ...u.$set }; }),
  };
  return { s: s as BehaviourService, sets };
}
const coordinator = (campusId?: Types.ObjectId) => ({ role: 'academic_coordinator', userId: ME, name: 'Ms Coordinator', campusId: campusId ? String(campusId) : undefined } as any);
const teacher = { role: 'teacher', userId: ME, name: 'Mr Teacher' } as any;

describe('D2: academic coordinator edits any Tarbiyah assessment of their school', () => {
  it("edits another author's assessment in ENFORCE mode and the last editor is stamped; the author is not rewritten", async () => {
    const { s, sets } = tarbiyahSvc({ assessedById: new Types.ObjectId(OTHER), assessedBy: 'Mr Khan', campusId: CAMPUS_A });
    await s.updateTarbiyahAssessment(ID, 'sch', { teacherObservations: 'x', assessedBy: 'evil', assessedById: ME }, coordinator(CAMPUS_A), enforce({ role: 'academic_coordinator', isTeacher: false }));
    expect(sets[0]).toMatchObject({ teacherObservations: 'x', updatedBy: 'Ms Coordinator' });
    expect(String(sets[0].updatedById)).toBe(ME);
    expect(sets[0]).not.toHaveProperty('assessedBy');
    expect(sets[0]).not.toHaveProperty('assessedById');
  });
  it('a coordinator of ANOTHER campus is refused when both sides carry a campus; a campus-less coordinator or assessment is allowed', async () => {
    const other = tarbiyahSvc({ assessedById: new Types.ObjectId(OTHER), campusId: CAMPUS_A });
    await expect(other.s.updateTarbiyahAssessment(ID, 'sch', { teacherObservations: 'x' }, coordinator(CAMPUS_B), enforce({ role: 'academic_coordinator', isTeacher: false }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(other.sets).toHaveLength(0);
    const noCampusUser = tarbiyahSvc({ assessedById: new Types.ObjectId(OTHER), campusId: CAMPUS_A });
    await noCampusUser.s.updateTarbiyahAssessment(ID, 'sch', { teacherObservations: 'x' }, coordinator(), enforce({ role: 'academic_coordinator', isTeacher: false }));
    expect(noCampusUser.sets).toHaveLength(1);
    const noCampusRow = tarbiyahSvc({ assessedById: new Types.ObjectId(OTHER) });
    await noCampusRow.s.updateTarbiyahAssessment(ID, 'sch', { teacherObservations: 'x' }, coordinator(CAMPUS_B), enforce({ role: 'academic_coordinator', isTeacher: false }));
    expect(noCampusRow.sets).toHaveLength(1);
  });
  it('a teacher still cannot edit someone else\'s assessment (enforce), and the author\'s own edit is stamped too', async () => {
    const other = tarbiyahSvc({ assessedById: new Types.ObjectId(OTHER) });
    await expect(other.s.updateTarbiyahAssessment(ID, 'sch', { teacherObservations: 'x' }, teacher, enforce())).rejects.toBeInstanceOf(ForbiddenException);
    const own = tarbiyahSvc({ assessedById: new Types.ObjectId(ME) });
    await own.s.updateTarbiyahAssessment(ID, 'sch', { teacherObservations: 'x' }, teacher, enforce());
    expect(own.sets[0]).toMatchObject({ updatedBy: 'Mr Teacher' });
  });
});

describe('custom role with the behaviour MANAGE grant edits others\' records; without it, author-only', () => {
  it('customRoleIsElevated: manage (sub-module or module-wide) yes; view, other module, other sub-module only no', () => {
    expect(customRoleIsElevated([{ moduleKey: 'behaviour', level: 'manage' }], 'records')).toBe(true);
    expect(customRoleIsElevated([{ moduleKey: 'behaviour', level: 'manage', subModuleKey: 'records' }], 'records')).toBe(true);
    expect(customRoleIsElevated([{ moduleKey: 'behaviour', level: 'manage', subModuleKey: 'tarbiyah' }], 'records')).toBe(false);
    expect(customRoleIsElevated([{ moduleKey: 'behaviour', level: 'view' }], 'records')).toBe(false);
    expect(customRoleIsElevated([{ moduleKey: 'hr', level: 'manage' }], 'records')).toBe(false);
    expect(customRoleIsElevated([{ moduleKey: 'behaviour', level: 'manage' }, { moduleKey: 'behaviour', level: 'view', subModuleKey: 'records' }], 'records')).toBe(false);   // the sub-specific entry wins
    expect(customRoleIsElevated(null, 'records')).toBe(false);
  });
  it('elevated teacher-base custom-role user edits another author\'s behaviour record and Tarbiyah (always-enforced D7 rule is skipped), stamped', async () => {
    const rec = recordSvc({ reportedById: new Types.ObjectId(OTHER), reportedBy: 'Mr Khan' });
    await rec.s.updateRecord(ID, 'sch', { title: 'x' }, teacher, enforce({ elevated: true }));
    expect(rec.sets[0]).toMatchObject({ title: 'x', updatedBy: 'Mr Teacher' });
    const t = tarbiyahSvc({ assessedById: new Types.ObjectId(OTHER) });
    await t.s.updateTarbiyahAssessment(ID, 'sch', { teacherObservations: 'x' }, teacher, enforce({ elevated: true }));
    expect(t.sets).toHaveLength(1);
  });
  it('NOT elevated (no manage grant): author-only, 403 on another author\'s record, in enforce AND log mode', async () => {
    for (const mode of ['enforce', 'log']) {
      const rec = recordSvc({ reportedById: new Types.ObjectId(OTHER), reportedBy: 'Mr Khan' });
      await expect(rec.s.updateRecord(ID, 'sch', { title: 'x' }, teacher, enforce({ mode, enforce: mode === 'enforce' }))).rejects.toBeInstanceOf(ForbiddenException);
      expect(rec.sets).toHaveLength(0);
    }
  });
  it('an elevated user still cannot move a record to another school (protected fields are stripped for everyone)', async () => {
    const rec = recordSvc({ reportedById: new Types.ObjectId(OTHER), reportedBy: 'Mr Khan' });
    await rec.s.updateRecord(ID, 'sch', { title: 'x', schoolSlug: 'evil', campusId: 'evil' }, teacher, enforce({ elevated: true }));
    expect(rec.sets[0]).not.toHaveProperty('schoolSlug');
    expect(rec.sets[0]).not.toHaveProperty('campusId');
  });
});
