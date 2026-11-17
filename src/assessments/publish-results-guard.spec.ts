import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AssessmentService } from './assessment.service';

const ASSESSMENT_ID = new Types.ObjectId().toString();

// Regression coverage for publishResults: it used to flip an assessment's
// status to result_published and "notify guardians" even when zero report
// cards existed for it (e.g. generate-report-cards was never run), so an
// admin couldn't tell "nothing to publish" from "published successfully".

function chain(v: any) {
  const c: any = { lean: () => Promise.resolve(v), select: () => c, sort: () => c };
  return c;
}

function makeService(reportCardCount: number) {
  const reportCardModel: any = {
    countDocuments: jest.fn().mockResolvedValue(reportCardCount),
    updateMany: jest.fn().mockResolvedValue({}),
    find: jest.fn(() => chain([])),
    db: {},
  };
  const assessmentModel: any = { findByIdAndUpdate: jest.fn().mockResolvedValue({ title: 'Mid Term' }) };
  const n: any = {};
  // positions: assessment,question,mark,reportCard,examPaper,omrSheet,quizAttempt,
  // student,school,campus,institution,grade,subject,staff,teacherProfile,
  // configService,pdfService,uploadService
  const service = new AssessmentService(
    assessmentModel, n, n, reportCardModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n,
  );
  return { service, reportCardModel, assessmentModel };
}

describe('AssessmentService.publishResults', () => {
  it('throws instead of silently publishing when no report cards exist yet', async () => {
    const { service, assessmentModel } = makeService(0);
    await expect(service.publishResults({ assessmentId: ASSESSMENT_ID, schoolSlug: 's' } as any))
      .rejects.toThrow(BadRequestException);
    expect(assessmentModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('publishes normally once report cards exist', async () => {
    const { service, reportCardModel, assessmentModel } = makeService(3);
    const result = await service.publishResults({ assessmentId: ASSESSMENT_ID, schoolSlug: 's' } as any);
    expect(reportCardModel.updateMany).toHaveBeenCalled();
    expect(assessmentModel.findByIdAndUpdate).toHaveBeenCalled();
    expect(result.message).toMatch(/published/i);
  });
});
