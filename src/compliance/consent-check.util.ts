import { Model, Types } from 'mongoose';
import { ConsentRecordDocument } from './schemas/compliance.schema';

// Opt-out model: the absence of a ConsentRecord is the normal, default case
// for the vast majority of students (no decision has ever been recorded
// either way) and must never be treated as a withdrawal. Only an explicit
// withdrawn photo_video_use record for this exact student blocks use of
// their photo. Takes the model directly (not the ComplianceService) so a
// module like id-cards can perform this one check without pulling in the
// whole compliance module.
export async function isPhotoUseWithdrawn(
  consentModel: Model<ConsentRecordDocument>,
  studentId: string | undefined | null,
  schoolSlug: string,
): Promise<boolean> {
  if (!studentId || !Types.ObjectId.isValid(studentId)) return false;
  const withdrawn = await consentModel.exists({
    schoolSlug,
    subjectType: 'student',
    subjectRef: new Types.ObjectId(studentId),
    consentType: 'photo_video_use',
    status: 'withdrawn',
  });
  return !!withdrawn;
}
