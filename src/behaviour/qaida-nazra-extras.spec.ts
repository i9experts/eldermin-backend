import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QaidaNazraExtrasService } from './qaida-nazra-extras.service';
import { DEFAULT_INVIGILATOR_KPIS } from './schemas/qaida-nazra-extras.schema';

function makeService(opts: {
  settings?: any; students?: any[]; createdDocs?: any[]; homeEntry?: any;
} = {}) {
  const insertedDocs: any[] = [];
  const settingsModel: any = {
    findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(opts.settings ?? null) }),
    findOneAndUpdate: jest.fn().mockResolvedValue({ schoolSlug: 'demo-school' }),
  };
  const invigilatorModel: any = {
    insertMany: jest.fn((docs: any[]) => { insertedDocs.push(...docs); return Promise.resolve(docs); }),
    find: jest.fn().mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([]) }) }),
  };
  const homeLogModel: any = {
    create: jest.fn((doc: any) => Promise.resolve(doc)),
    find: jest.fn().mockReturnValue({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }),
    findOne: jest.fn().mockReturnValue(Promise.resolve(opts.homeEntry)),
  };
  const studentModel: any = {
    find: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(opts.students ?? []) }) }),
  };
  const service = new QaidaNazraExtrasService(settingsModel, invigilatorModel, homeLogModel, studentModel);
  return { service, insertedDocs, settingsModel, invigilatorModel, homeLogModel };
}

describe('QaidaNazraExtrasService.getSettings', () => {
  it('returns sensible defaults (standard order, 5 named KPIs) when no settings doc exists', async () => {
    const { service } = makeService();
    const settings = await service.getSettings('demo-school');
    expect(settings.nazraReverseOrder).toBe(false);
    expect(settings.invigilatorKpis).toEqual(DEFAULT_INVIGILATOR_KPIS);
  });
});

describe('QaidaNazraExtrasService.recordAssessments', () => {
  const student = { _id: '507f1f77bcf86cd799439011', firstName: 'Ali', currentGrade: 'Grade 4', currentSection: 'B', campusId: null };

  it('rejects an unknown KPI key', async () => {
    const { service } = makeService({ students: [student] });
    await expect(service.recordAssessments('demo-school', '2025-26', {
      program: 'qaida', invigilatorType: 'external', invigilatorName: 'Qari Abdullah',
      entries: [{ studentId: student._id, scores: [{ key: 'not_a_real_kpi', score: 4 }] }],
    } as any, 'Admin')).rejects.toThrow(BadRequestException);
  });

  it('rejects a score outside the configured rating scale', async () => {
    const { service } = makeService({ students: [student] });
    await expect(service.recordAssessments('demo-school', '2025-26', {
      program: 'qaida', invigilatorType: 'external', invigilatorName: 'Qari Abdullah',
      entries: [{ studentId: student._id, scores: [{ key: 'makharij', score: 9 }] }],
    } as any, 'Admin')).rejects.toThrow(BadRequestException);
  });

  it('requires invigilatorStaffId for an internal invigilator', async () => {
    const { service } = makeService({ students: [student] });
    await expect(service.recordAssessments('demo-school', '2025-26', {
      program: 'qaida', invigilatorType: 'internal', invigilatorName: 'Miss Ayesha',
      entries: [{ studentId: student._id, scores: [{ key: 'makharij', score: 4 }] }],
    } as any, 'Admin')).rejects.toThrow(BadRequestException);
  });

  it('records a batch visit covering multiple students with denormalized roster info and an averaged overallScore', async () => {
    const student2 = { _id: '507f1f77bcf86cd799439012', firstName: 'Zara', currentGrade: 'Grade 4', currentSection: 'B', campusId: null };
    const { service, insertedDocs } = makeService({ students: [student, student2] });
    await service.recordAssessments('demo-school', '2025-26', {
      program: 'nazra', invigilatorType: 'external', invigilatorName: 'Qari Abdullah', invigilatorOrganization: 'Jamia Noor',
      entries: [
        { studentId: student._id, scores: [{ key: 'makharij', score: 4 }, { key: 'tajweed', score: 3 }] },
        { studentId: student2._id, scores: [{ key: 'makharij', score: 5 }] },
      ],
    } as any, 'Admin');

    expect(insertedDocs).toHaveLength(2);
    expect(insertedDocs[0].studentName).toBe('Ali');
    expect(insertedDocs[0].grade).toBe('Grade 4');
    expect(insertedDocs[0].overallScore).toBeCloseTo(3.5);
    expect(insertedDocs[1].overallScore).toBe(5);
  });
});

describe('QaidaNazraExtrasService home recitation log', () => {
  const entryId = '507f1f77bcf86cd799439099';
  const guardian1 = '507f1f77bcf86cd799439001';
  const guardian2 = '507f1f77bcf86cd799439002';

  it('lets a guardian delete their own logged entry', async () => {
    const entry = { _id: entryId, loggedByGuardianId: guardian1, deleteOne: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeService({ homeEntry: entry });
    const result = await service.deleteHomeEntry(entryId, 'demo-school', guardian1);
    expect(result.message).toBe('Entry removed');
    expect(entry.deleteOne).toHaveBeenCalled();
  });

  it("refuses to delete another guardian's entry", async () => {
    const entry = { _id: entryId, loggedByGuardianId: guardian1, deleteOne: jest.fn() };
    const { service } = makeService({ homeEntry: entry });
    await expect(service.deleteHomeEntry(entryId, 'demo-school', guardian2)).rejects.toThrow(BadRequestException);
    expect(entry.deleteOne).not.toHaveBeenCalled();
  });

  it('404s deleting an entry that does not exist', async () => {
    const { service } = makeService({ homeEntry: null });
    await expect(service.deleteHomeEntry(entryId, 'demo-school', guardian1)).rejects.toThrow(NotFoundException);
  });
});
