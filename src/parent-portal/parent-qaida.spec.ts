// What a guardian receives from GET /parent-portal/students/:id/qaida (+ /pdf). Fakes only, no DB. Constructor slots as in
// parent-behaviour.spec.ts; the QaidaService is the last constructor argument.
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ParentPortalService } from './parent-portal.service';
import { projectParentQaidaReport } from './parent-qaida.projection';

const MODEL_COUNT = 28;
const sid = new Types.ObjectId();
const OTHER = new Types.ObjectId();

const fullReport = () => ({
  studentId: sid, studentName: 'Lubaba', grade: 'KINDERGARTEN', section: 'KG A', currentTakhti: 2, overallStatus: 'in_progress',
  recordType: 'joined_later', priorRecordNote: 'Transferred from X, family matter', masteredCount: 1, totalTakhtis: 16, trackedTakhtis: 16,
  masteryPct: 6, startDate: new Date('2026-10-26'), currentTeacher: 'Ms Fatima', overallRemarks: 'Steady progress',
  takhtis: [{
    number: 1, key: 'mufradat', titleEn: 'Mufradat', titleUr: 'مفردات', description: 'internal', focus: ['makhraj'], pageReference: 'p. 2',
    referenceContent: ['ا'], status: 'mastered', startedDate: new Date(), masteredDate: new Date(), revisionCount: 0, attemptCount: 1,
    sabaqLog: [{ date: new Date(), sabaqFrom: 'Alif', sabaqTo: 'Kaf', rating: 'proficient', assessedBy: 'Ms Fatima' }],
    latestAttempt: { date: new Date(), rating: 'proficient', makhrajAccuracy: 4, errorsNoted: ['missed_ghunna'], remarks: 'Good', assessedBy: 'Ms Fatima', assessedById: 'u1' },
  }],
  commonErrors: [{ error: 'makhraj_confusion', count: 3 }],
});

function build(opts: { studentInSchool?: boolean; suspended?: boolean; report?: () => Promise<any> } = {}) {
  const studentModel = { exists: jest.fn(() => Promise.resolve(opts.studentInSchool === false ? null : { _id: sid })) };
  const models: any[] = Array.from({ length: MODEL_COUNT }, () => ({}));
  models[0] = studentModel;
  const parentAccess: any = { checkFeature: jest.fn(() => Promise.resolve(opts.suspended ? { suspended: true, reason: 'paused' } : { suspended: false })) };
  const qaidaService: any = { getReportData: jest.fn(opts.report ?? (() => Promise.resolve(fullReport()))) };
  const pdfService: any = { generateQaidaReport: jest.fn(() => Promise.resolve(Buffer.from('%PDF-1.4'))) };
  const svc: any = new (ParentPortalService as any)(...models, {}, {}, {}, pdfService, parentAccess, {}, {}, {}, {}, qaidaService);
  return { svc, qaidaService, pdfService, studentModel, parentAccess };
}

const parent = (children: any[]) => ({ role: 'parent', userId: 'p1', guardianOfStudentIds: children.map(String) });

describe('parent Qaida projection (allowlist)', () => {
  it('keeps the report facts and drops staff-only / internal fields', () => {
    const out: any = projectParentQaidaReport(fullReport());
    expect(out.masteryPct).toBe(6);
    expect(out.takhtis[0]).toMatchObject({ number: 1, titleEn: 'Mufradat', status: 'mastered', attemptCount: 1 });
    expect(out.takhtis[0].latestAttempt).toMatchObject({ rating: 'proficient', remarks: 'Good', errorsNoted: ['missed_ghunna'] });
    expect(out.commonErrors).toEqual([{ error: 'makhraj_confusion', count: 3 }]);
    const json = JSON.stringify(out);
    for (const secret of ['assessedBy', 'assessedById', 'priorRecordNote', 'recordType', 'studentId', 'referenceContent', 'description', 'focus']) {
      expect(json).not.toContain(`"${secret}"`);
    }
  });
});

describe('ParentPortalService.getQaidaReport / downloadQaidaPdf', () => {
  it("returns the projected report for the parent's own child", async () => {
    const { svc, studentModel } = build();
    const r = await svc.getQaidaReport(String(sid), parent([sid]), 'demo-school');
    expect(r.recorded).toBe(true);
    expect(r.studentName).toBe('Lubaba');
    expect(JSON.stringify(r)).not.toContain('assessedBy');
    expect(studentModel.exists).toHaveBeenCalledWith(expect.objectContaining({ schoolSlug: 'demo-school' }));
  });

  it("refuses someone else's child before touching any data", async () => {
    const { svc, qaidaService, parentAccess } = build();
    await expect(svc.getQaidaReport(String(OTHER), parent([sid]), 'demo-school')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.downloadQaidaPdf(String(OTHER), parent([sid]), 'demo-school')).rejects.toBeInstanceOf(ForbiddenException);
    expect(parentAccess.checkFeature).not.toHaveBeenCalled();
    expect(qaidaService.getReportData).not.toHaveBeenCalled();
  });

  it('a suspended feature answers the suspended placeholder, no data', async () => {
    const { svc, qaidaService } = build({ suspended: true });
    expect(await svc.getQaidaReport(String(sid), parent([sid]), 'demo-school')).toMatchObject({ suspended: true, feature: 'tarbiyah_report' });
    expect(qaidaService.getReportData).not.toHaveBeenCalled();
  });

  it('a child with no Qaida record yet is { recorded: false }, not an error', async () => {
    const { svc } = build({ report: () => Promise.reject(new NotFoundException('No Qaida progress recorded')) });
    expect(await svc.getQaidaReport(String(sid), parent([sid]), 'demo-school')).toEqual({ recorded: false });
  });

  it('other errors still surface', async () => {
    const { svc } = build({ report: () => Promise.reject(new Error('db down')) });
    await expect(svc.getQaidaReport(String(sid), parent([sid]), 'demo-school')).rejects.toThrow('db down');
  });

  it('a child that is not in this school is a 404 (tenant check)', async () => {
    const { svc } = build({ studentInSchool: false });
    await expect(svc.getQaidaReport(String(sid), parent([sid]), 'demo-school')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.downloadQaidaPdf(String(sid), parent([sid]), 'demo-school')).rejects.toBeInstanceOf(NotFoundException);
  });

  it("downloads the web's Qaida PDF for the own child", async () => {
    const { svc, pdfService } = build();
    const pdf = await svc.downloadQaidaPdf(String(sid), parent([sid]), 'demo-school');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdfService.generateQaidaReport).toHaveBeenCalledWith('demo-school', { studentId: String(sid) }, 'p1');
  });
});
