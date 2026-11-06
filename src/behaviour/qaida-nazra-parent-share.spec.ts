import { QaidaService } from './qaida.service';
import { NazraService } from './nazra.service';
import { projectParentNazraReport } from '../parent-portal/parent-nazra.projection';

// Qaida/Nazra progress was never visible in the Parent Portal because
// QaidaProgress/NazraProgress had no share/publish flag at all (unlike
// TarbiyahAssessment.parentShared) - these pin the fix: the share toggle
// itself and the parent-read gate (getParentVisibleProgress returning null
// until shared). The field allowlist for what a parent actually sees lives
// in parent-qaida.projection.ts/parent-nazra.projection.ts, projecting
// QaidaService/NazraService's getReportData() output - projectParentNazraReport
// is pinned here; projectParentQaidaReport already has its own coverage.

function makeQaidaProgress(overrides: Partial<any> = {}) {
  return {
    studentId: '507f1f77bcf86cd799439011',
    studentName: 'Test Student',
    grade: 'Grade 3',
    section: 'A',
    campusId: 'campus-1',
    schoolSlug: 'demo-school',
    academicYear: '2026-27',
    currentTeacher: 'Ms. Ayesha',
    currentTeacherId: 'staff-1',
    overallRemarks: 'Doing well',
    recordType: 'full_history',
    priorRecordNote: 'Internal placement note',
    parentShared: false,
    takhtis: [{ takhtiNumber: 1, status: 'mastered', startedDate: new Date(), masteredDate: new Date(), revisionCount: 0, attempts: [{ rating: 'mastered', remarks: 'great', assessedBy: 'Ms. Ayesha' }] }],
    currentTakhti: 2,
    overallStatus: 'in_progress',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeQaidaService(progress: any) {
  const progressModel: any = {
    findOne: jest.fn((filter: any) => {
      const chain: any = { lean: () => Promise.resolve(filter.parentShared && !progress.parentShared ? null : progress) };
      return Object.assign(Promise.resolve(progress), chain);
    }),
  };
  const studentModel: any = {};
  return new QaidaService(progressModel, studentModel);
}

describe('QaidaService.updateParentShared', () => {
  it('shares and stamps parentSharedDate on first share', async () => {
    const progress = makeQaidaProgress();
    const service = makeQaidaService(progress);
    const result = await service.updateParentShared('507f1f77bcf86cd799439011', 'demo-school', true);
    expect(result.parentShared).toBe(true);
    expect(result.parentSharedDate).toBeInstanceOf(Date);
    expect(progress.save).toHaveBeenCalled();
  });

  it('un-sharing clears visibility but keeps the original parentSharedDate', async () => {
    const sharedDate = new Date('2026-01-01');
    const progress = makeQaidaProgress({ parentShared: true, parentSharedDate: sharedDate });
    const service = makeQaidaService(progress);
    const result = await service.updateParentShared('507f1f77bcf86cd799439011', 'demo-school', false);
    expect(result.parentShared).toBe(false);
    expect(result.parentSharedDate).toBe(sharedDate);
  });
});

describe('QaidaService.getParentVisibleProgress', () => {
  it('returns null when no progress has been shared', async () => {
    const progress = makeQaidaProgress({ parentShared: false });
    const service = makeQaidaService(progress);
    const result = await service.getParentVisibleProgress('507f1f77bcf86cd799439011', 'demo-school');
    expect(result).toBeNull();
  });

  it('returns the progress doc once shared', async () => {
    const progress = makeQaidaProgress({ parentShared: true });
    const service = makeQaidaService(progress);
    const result = await service.getParentVisibleProgress('507f1f77bcf86cd799439011', 'demo-school');
    expect(result).toEqual(progress);
  });
});

function makeNazraProgress(overrides: Partial<any> = {}) {
  return {
    studentId: '507f1f77bcf86cd799439011',
    studentName: 'Test Student',
    grade: 'Grade 3',
    section: 'A',
    campusId: 'campus-1',
    schoolSlug: 'demo-school',
    academicYear: '2026-27',
    currentTeacher: 'Ms. Ayesha',
    currentTeacherId: 'staff-1',
    overallRemarks: 'Doing well',
    recordType: 'full_history',
    priorRecordNote: 'Internal placement note',
    parentShared: false,
    paras: [{ paraNumber: 1, status: 'completed', startedDate: new Date(), completedDate: new Date(), revisionCount: 0, attempts: [{ rating: 'excellent', remarks: 'great' }] }],
    diaryEntries: [{ date: new Date(), sabaq: {} }],
    currentPara: 2,
    overallStatus: 'in_progress',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeNazraService(progress: any) {
  const progressModel: any = {
    findOne: jest.fn((filter: any) => {
      const chain: any = { lean: () => Promise.resolve(filter.parentShared && !progress.parentShared ? null : progress) };
      return Object.assign(Promise.resolve(progress), chain);
    }),
  };
  const studentModel: any = {};
  const settingsModel: any = {};
  return new NazraService(progressModel, studentModel, settingsModel);
}

describe('NazraService.updateParentShared / getParentVisibleProgress', () => {
  it('shares and stamps parentSharedDate', async () => {
    const progress = makeNazraProgress();
    const service = makeNazraService(progress);
    const result = await service.updateParentShared('507f1f77bcf86cd799439011', 'demo-school', true);
    expect(result.parentShared).toBe(true);
    expect(result.parentSharedDate).toBeInstanceOf(Date);
  });

  it('getParentVisibleProgress returns null until shared', async () => {
    const progress = makeNazraProgress({ parentShared: false });
    const service = makeNazraService(progress);
    expect(await service.getParentVisibleProgress('507f1f77bcf86cd799439011', 'demo-school')).toBeNull();
  });
});

describe('projectParentNazraReport', () => {
  it('keeps only the parent-safe fields and strips internal/sensitive ones, including the diary log', () => {
    const report = {
      studentName: 'Test Student', grade: 'Grade 3', section: 'A', currentPara: 2, overallStatus: 'in_progress',
      completedCount: 1, totalParas: 30, trackedParas: 2, completionPct: 50,
      currentTeacher: 'Ms. Ayesha', overallRemarks: 'Doing well',
      recordType: 'full_history', priorRecordNote: 'Internal placement note',
      diaryLog: [{ date: new Date(), assessedBy: 'Ms. Ayesha', sabaq: {} }],
      paras: [{
        number: 1, titleEn: 'Para 1', status: 'completed', revisionCount: 0, attemptCount: 1,
        latestAttempt: { date: new Date(), rating: 'excellent', remarks: 'great', assessedBy: 'Ms. Ayesha' },
      }],
      commonErrors: [],
    };
    const out = projectParentNazraReport(report);
    expect(out.recordType).toBeUndefined();
    expect(out.priorRecordNote).toBeUndefined();
    expect(out.diaryLog).toBeUndefined();
    expect(out.paras[0].latestAttempt.assessedBy).toBeUndefined();
    expect(out.paras[0].number).toBe(1);
    expect(out.currentPara).toBe(2);
    expect(out.currentTeacher).toBe('Ms. Ayesha');
  });
});
