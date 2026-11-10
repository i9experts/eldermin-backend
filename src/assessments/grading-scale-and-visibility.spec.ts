import { AssessmentService } from './assessment.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

// Assessment Master Settings: grading-scale CRUD/presets, the resolve+
// snapshot logic generateReportCards/generateTermReportCards rely on, and
// the parent-visibility settings CRUD. No real Mongo - each test wires in
// just the model methods the code under test actually calls.

function makeService(overrides: Record<string, any> = {}) {
  const svc: any = Object.create(AssessmentService.prototype);
  svc.assessmentModel = overrides.assessmentModel ?? { updateOne: async () => ({}) };
  svc.gradingScaleModel = overrides.gradingScaleModel;
  svc.visibilitySettingsModel = overrides.visibilitySettingsModel;
  return svc;
}

describe('AssessmentService — Assessment Master Settings: grading scale presets', () => {
  it('ships real built-in presets covering the boards mentioned in the feature request', () => {
    const svc = makeService();
    const presets = svc.getGradingScalePresets();
    const keys = presets.map((p: any) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['default', 'ib', 'cambridge', 'aku-eb', 'provincial']));
    // every preset's bands must be well-formed and span 0-100
    for (const preset of presets) {
      expect(preset.bands.length).toBeGreaterThan(0);
      expect(Math.min(...preset.bands.map((b: any) => b.minPercent))).toBe(0);
      expect(Math.max(...preset.bands.map((b: any) => b.maxPercent))).toBeCloseTo(100, 0);
    }
  });
});

describe('AssessmentService — Assessment Master Settings: grading scale CRUD', () => {
  it('createGradingScale rejects a second scale for a framework that already has one', async () => {
    const gradingScaleModel: any = { findOne: async () => ({ _id: 'existing' }), create: jest.fn() };
    const svc = makeService({ gradingScaleModel });
    await expect(svc.createGradingScale({ schoolSlug: 's', framework: 'cambridge', name: 'X', bands: [] }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(gradingScaleModel.create).not.toHaveBeenCalled();
  });

  it('createGradingScale creates one when none exists yet for that framework', async () => {
    const gradingScaleModel: any = { findOne: async () => null, create: jest.fn(async (dto: any) => ({ _id: 'new', ...dto })) };
    const svc = makeService({ gradingScaleModel });
    const result = await svc.createGradingScale({ schoolSlug: 's', framework: 'ib', name: 'IB Scale', bands: [{ minPercent: 0, maxPercent: 100, label: '7' }] });
    expect(result._id).toBe('new');
  });

  it('updateGradingScale 404s for a scale in a different school or that does not exist', async () => {
    const gradingScaleModel: any = { findOneAndUpdate: async () => null };
    const svc = makeService({ gradingScaleModel });
    await expect(svc.updateGradingScale('507f1f77bcf86cd799439011', 's', { name: 'New Name' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('deleteGradingScale 404s when nothing was deleted', async () => {
    const gradingScaleModel: any = { findOneAndDelete: async () => null };
    const svc = makeService({ gradingScaleModel });
    await expect(svc.deleteGradingScale('507f1f77bcf86cd799439011', 's')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AssessmentService — resolveAndSnapshotGradingScale', () => {
  it('a legacy assessment with no framework set reuses whatever is already in gradingScale, never looks up or blocks', async () => {
    const gradingScaleModel: any = { findOne: jest.fn() };
    const svc = makeService({ gradingScaleModel });
    const assessment = { _id: 'a1', schoolSlug: 's', framework: undefined, gradingScaleSnapshotted: false, gradingScale: { 'A+': { min: 90, gpa: 4 } } };
    const result = await svc.resolveAndSnapshotGradingScale(assessment);
    expect(result).toBe(assessment.gradingScale);
    expect(gradingScaleModel.findOne).not.toHaveBeenCalled();
  });

  it('a framework set but already snapshotted reuses the stored gradingScale, never re-resolves', async () => {
    const gradingScaleModel: any = { findOne: jest.fn() };
    const svc = makeService({ gradingScaleModel });
    const assessment = { _id: 'a1', schoolSlug: 's', framework: 'cambridge', gradingScaleSnapshotted: true, gradingScale: { 'A*': { min: 90, gpa: 4 } } };
    const result = await svc.resolveAndSnapshotGradingScale(assessment);
    expect(result).toBe(assessment.gradingScale);
    expect(gradingScaleModel.findOne).not.toHaveBeenCalled();
  });

  it('a framework set, not yet snapshotted, with a matching scale: snapshots and persists it', async () => {
    const updateOne = jest.fn(async () => ({}));
    const gradingScaleModel: any = {
      findOne: () => ({ lean: async () => ({ bands: [{ label: 'A-1', minPercent: 90, gpaPoint: 4 }, { label: 'F', minPercent: 0, gpaPoint: 0 }] }) }),
    };
    const svc = makeService({ gradingScaleModel, assessmentModel: { updateOne } });
    const assessment = { _id: 'a1', schoolSlug: 's', framework: 'aku-eb', gradingScaleSnapshotted: false, gradingScale: {} };
    const result = await svc.resolveAndSnapshotGradingScale(assessment);
    expect(result).toEqual({ 'A-1': { min: 90, gpa: 4 }, 'F': { min: 0, gpa: 0 } });
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'a1' },
      { $set: { gradingScale: result, gradingScaleSnapshotted: true } },
    );
  });

  it('a framework set, not yet snapshotted, with NO matching scale: blocks (this is what gates Generate Report Cards / Publish Results)', async () => {
    const gradingScaleModel: any = { findOne: () => ({ lean: async () => null }) };
    const svc = makeService({ gradingScaleModel });
    const assessment = { _id: 'a1', schoolSlug: 's', framework: 'ib', gradingScaleSnapshotted: false, gradingScale: {} };
    await expect(svc.resolveAndSnapshotGradingScale(assessment)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.resolveAndSnapshotGradingScale(assessment)).rejects.toThrow(/ib/);
  });
});

describe('AssessmentService — majorityFramework', () => {
  it('returns undefined when no assessment in the set has a framework (legacy term)', () => {
    const svc = makeService();
    expect(svc.majorityFramework([{ framework: undefined }, {}])).toBeUndefined();
  });

  it('returns the most common framework among the set', () => {
    const svc = makeService();
    expect(svc.majorityFramework([{ framework: 'cambridge' }, { framework: 'cambridge' }, { framework: 'ib' }])).toBe('cambridge');
  });
});

describe('AssessmentService — Assessment Master Settings: parent visibility settings', () => {
  it('getVisibilitySettings returns the documented defaults when no settings doc exists yet for this school', async () => {
    const visibilitySettingsModel: any = { findOne: () => ({ lean: async () => null }) };
    const svc = makeService({ visibilitySettingsModel });
    const result = await svc.getVisibilitySettings('new-school');
    expect(result).toEqual({ schoolSlug: 'new-school', shareGPA: true, shareSubjectBreakdown: true, shareClassPosition: false, shareClassAverage: false, passLabel: 'Pass', failLabel: 'Fail' });
  });

  it('getVisibilitySettings returns the stored document when one exists', async () => {
    const stored = { schoolSlug: 's', shareGPA: false, shareSubjectBreakdown: true, shareClassPosition: true, shareClassAverage: true };
    const visibilitySettingsModel: any = { findOne: () => ({ lean: async () => stored }) };
    const svc = makeService({ visibilitySettingsModel });
    expect(await svc.getVisibilitySettings('s')).toEqual(stored);
  });

  it('updateVisibilitySettings upserts and never lets the dto overwrite schoolSlug on insert (no $set/$setOnInsert conflict)', async () => {
    const findOneAndUpdate = jest.fn(async (filter: any, update: any) => ({ ...filter, ...update.$set }));
    const visibilitySettingsModel: any = { findOneAndUpdate };
    const svc = makeService({ visibilitySettingsModel });
    await svc.updateVisibilitySettings('s', { schoolSlug: 'sneaky-other-school', shareClassPosition: true });
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ schoolSlug: 's' });
    expect(update.$set).toEqual({ shareClassPosition: true });
    expect(update.$set.schoolSlug).toBeUndefined();
  });
});
