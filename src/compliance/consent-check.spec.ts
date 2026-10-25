import { Types } from 'mongoose';
import { isPhotoUseWithdrawn } from './consent-check.util';

const SID = new Types.ObjectId().toHexString();
const SCHOOL = 'demo-school';

function mockModel(exists: boolean) {
  return { exists: jest.fn(async () => (exists ? { _id: new Types.ObjectId() } : null)) } as any;
}

describe('isPhotoUseWithdrawn (opt-out consent model)', () => {
  it('returns true when a withdrawn photo_video_use record exists for the student', async () => {
    const model = mockModel(true);
    expect(await isPhotoUseWithdrawn(model, SID, SCHOOL)).toBe(true);
    expect(model.exists).toHaveBeenCalledWith({
      schoolSlug: SCHOOL,
      subjectType: 'student',
      subjectRef: new Types.ObjectId(SID),
      consentType: 'photo_video_use',
      status: 'withdrawn',
    });
  });

  it('returns false when no consent record exists at all (default/opt-out case)', async () => {
    const model = mockModel(false);
    expect(await isPhotoUseWithdrawn(model, SID, SCHOOL)).toBe(false);
  });

  it('returns false (not an error) for a missing studentId - nothing to check', async () => {
    const model = mockModel(true);
    expect(await isPhotoUseWithdrawn(model, undefined, SCHOOL)).toBe(false);
    expect(await isPhotoUseWithdrawn(model, '', SCHOOL)).toBe(false);
    expect(model.exists).not.toHaveBeenCalled();
  });

  it('returns false for an invalid ObjectId string rather than throwing', async () => {
    const model = mockModel(true);
    expect(await isPhotoUseWithdrawn(model, 'not-an-id', SCHOOL)).toBe(false);
    expect(model.exists).not.toHaveBeenCalled();
  });
});
