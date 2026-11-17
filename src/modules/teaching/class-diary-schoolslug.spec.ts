import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';

// ClassDiaryEntry.schoolSlug is required on the schema, but
// createClassDiaryEntry never set it - every save failed Mongoose
// validation with "ClassDiaryEntry validation failed: schoolSlug: Path
// `schoolSlug` is required." The client correctly never sends schoolSlug
// in the body (tenant/school scoping must come from the authenticated
// request), so it must be threaded in from the controller's req.user, the
// same way the sibling shareClassDiaryEntry/generateClassDiaryPdf
// endpoints already do.

function makeService(classDiaryModel: any) {
  const noop: any = {};
  return new TeachingService(
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    classDiaryModel, noop, noop, noop, noop, noop, noop,
  );
}

describe('TeachingService.createClassDiaryEntry', () => {
  it('sets schoolSlug on the created document from the passed-in value', async () => {
    const classDiaryModel: any = {
      create: jest.fn((doc: any) => Promise.resolve({ ...doc, _id: new Types.ObjectId() })),
    };
    const service = makeService(classDiaryModel);

    await service.createClassDiaryEntry(
      'tenant1', String(new Types.ObjectId()), 'demo-school',
      { gradeLevel: '5', sectionName: 'A', diaryDate: '2026-10-26', periods: [] },
    );

    expect(classDiaryModel.create).toHaveBeenCalledTimes(1);
    const [payload] = classDiaryModel.create.mock.calls[0];
    expect(payload.schoolSlug).toBe('demo-school');
  });
});
