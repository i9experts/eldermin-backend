// What a guardian receives from GET /parent-portal/students/:id/nazra. Fakes only, no DB. NazraService is the last constructor argument.
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ParentPortalService } from './parent-portal.service';
import { PARENT_NAZRA_DIARY_LIMIT, projectParentNazraReport } from './parent-nazra.projection';

const MODEL_COUNT = 28;
const sid = new Types.ObjectId();
const OTHER = new Types.ObjectId();

const entry = (day: number) => ({
  date: new Date(Date.UTC(2026, 9, day)), assessedBy: 'Ms Fatima', assessedById: 'u1',
  sabaq: { paraNumber: 1, pageFrom: '1', pageTo: '2', rating: 'proficient', makhrajAccuracy: 4, errorsNoted: ['qalqalah_missed'], remarks: `sabaq${day}` },
  sabqi: { paraNumber: 1, rating: 'developing', errorsNoted: [] },
  manzil: null,
});

const fullReport = (diary = 2) => ({
  studentId: sid, studentName: 'Lubaba', grade: 'KINDERGARTEN', section: 'KG A', currentPara: 2, overallStatus: 'in_progress', recordType: 'joined_later',
  priorRecordNote: 'internal note', completedCount: 1, totalParas: 30, trackedParas: 30, completionPct: 3, currentTeacher: 'Ms Fatima', overallRemarks: 'Good',
  paras: [{ number: 1, titleEn: 'Alif Lam Meem', titleAr: 'الم', approxPageRange: 'pp. 1-21', status: 'completed', completedDate: new Date(), revisionCount: 0, attemptCount: 1,
    latestAttempt: { date: new Date(), rating: 'proficient', pageFrom: '1', pageTo: '2', errorsNoted: [], remarks: 'ok', assessedBy: 'Ms Fatima' } }],
  diaryLog: Array.from({ length: diary }, (_, i) => entry(i + 1)),
  commonErrors: [{ error: 'qalqalah_missed', count: 2 }],
});

function build(opts: { studentInSchool?: boolean; suspended?: boolean; shared?: boolean; report?: () => Promise<any> } = {}) {
  const models: any[] = Array.from({ length: MODEL_COUNT }, () => ({}));
  models[0] = { exists: jest.fn(() => Promise.resolve(opts.studentInSchool === false ? null : { _id: sid })) };
  const parentAccess: any = { checkFeature: jest.fn(() => Promise.resolve(opts.suspended ? { suspended: true, reason: 'paused' } : { suspended: false })) };
  const nazraService: any = {
    getReportData: jest.fn(opts.report ?? (() => Promise.resolve(fullReport()))),
    getParentVisibleProgress: jest.fn(() => Promise.resolve(opts.shared === false ? null : { parentShared: true })),
  };
  const svc: any = new (ParentPortalService as any)(...models, {}, {}, {}, {}, parentAccess, {}, {}, {}, {}, {}, nazraService);
  return { svc, nazraService, parentAccess };
}

const parent = (children: any[]) => ({ role: 'parent', userId: 'p1', guardianOfStudentIds: children.map(String) });

describe('parent Nazra projection (allowlist)', () => {
  it('keeps the progress facts and drops staff-only fields', () => {
    const out: any = projectParentNazraReport(fullReport());
    expect(out.completionPct).toBe(3);
    expect(out.paras[0]).toMatchObject({ number: 1, titleEn: 'Alif Lam Meem', status: 'completed' });
    expect(out.diary[0].sabaq).toMatchObject({ paraNumber: 1, rating: 'proficient' });
    expect(out.diary[0].sabqi).toMatchObject({ rating: 'developing' });
    expect(out.diary[0].manzil).toBeNull();
    const json = JSON.stringify(out);
    for (const secret of ['assessedBy', 'assessedById', 'priorRecordNote', 'recordType', 'studentId']) expect(json).not.toContain(`"${secret}"`);
  });

  it('returns the diary newest first and capped, saying how many exist', () => {
    const out: any = projectParentNazraReport(fullReport(PARENT_NAZRA_DIARY_LIMIT + 5));
    expect(out.diary).toHaveLength(PARENT_NAZRA_DIARY_LIMIT);
    expect(out.diaryTotal).toBe(PARENT_NAZRA_DIARY_LIMIT + 5);
    expect(new Date(out.diary[0].date).getTime()).toBeGreaterThan(new Date(out.diary[1].date).getTime());
  });
});

describe('ParentPortalService.getNazraReport', () => {
  it("returns the projected report for the parent's own child", async () => {
    const { svc } = build();
    const r = await svc.getNazraReport(String(sid), parent([sid]), 'demo-school');
    expect(r.recorded).toBe(true);
    expect(r.studentName).toBe('Lubaba');
    expect(JSON.stringify(r)).not.toContain('assessedBy');
  });

  it("refuses someone else's child before touching any data", async () => {
    const { svc, nazraService, parentAccess } = build();
    await expect(svc.getNazraReport(String(OTHER), parent([sid]), 'demo-school')).rejects.toBeInstanceOf(ForbiddenException);
    expect(parentAccess.checkFeature).not.toHaveBeenCalled();
    expect(nazraService.getReportData).not.toHaveBeenCalled();
  });

  it('a suspended feature answers the placeholder, no data', async () => {
    const { svc, nazraService } = build({ suspended: true });
    expect(await svc.getNazraReport(String(sid), parent([sid]), 'demo-school')).toMatchObject({ suspended: true, feature: 'qaida_nazra_report' });
    expect(nazraService.getReportData).not.toHaveBeenCalled();
  });

  it('a child whose Nazra progress is not shared (or does not exist) is { recorded: false }, no data read', async () => {
    const { svc, nazraService } = build({ shared: false });
    expect(await svc.getNazraReport(String(sid), parent([sid]), 'demo-school')).toEqual({ recorded: false });
    expect(nazraService.getReportData).not.toHaveBeenCalled();
  });

  it('a report error still surfaces; a child outside this school is a 404', async () => {
    await expect(build({ report: () => Promise.reject(new Error('db down')) }).svc.getNazraReport(String(sid), parent([sid]), 'demo-school')).rejects.toThrow('db down');
    await expect(build({ studentInSchool: false }).svc.getNazraReport(String(sid), parent([sid]), 'demo-school')).rejects.toBeInstanceOf(NotFoundException);
  });
});
