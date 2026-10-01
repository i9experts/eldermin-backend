import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IssuedCertificateDocument = IssuedCertificate & Document;

// A real audit trail for every certificate actually printed - who got it,
// when, under which template, and with what data was on it at the time
// (dataSnapshot). Without this, a school issuing a Transfer Certificate
// has no record it ever happened, can't answer "did we already issue
// this student's TC", and can't reprint an identical copy later if the
// original is lost - all real, everyday needs for the most legally
// significant document this module produces. Not exposed as public
// verification (no public-facing portal exists yet in this codebase) -
// the QR code embeds the certificateNumber as plain text, same
// text-only-verifyCode convention IdCardsService already uses, ready to
// wire to a real lookup once a verification page exists.
@Schema({ timestamps: true, collection: 'issued_certificates' })
export class IssuedCertificate {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, unique: true }) certificateNumber: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'CertificateTemplate' }) templateId: Types.ObjectId;
  @Prop({ required: true }) certificateType: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ type: Object, default: {} }) dataSnapshot: Record<string, string>;
  @Prop({ required: true }) issuedBy: string;
  @Prop({ default: Date.now }) issuedAt: Date;

  // LMS Phase 3 - set only on a system auto-issue (see
  // CertificatesService.autoIssueCourseCompletion), never on a manual
  // batch generation. sourceId is the triggering record (a Syllabus id
  // for 'course_completion') - together with the partial unique index
  // below, this is what stops a student's 100%-completion check from
  // re-issuing a duplicate certificate every time they revisit an
  // already-finished course.
  @Prop() sourceType?: string;
  @Prop({ type: Types.ObjectId }) sourceId?: Types.ObjectId;
}

export const IssuedCertificateSchema = SchemaFactory.createForClass(IssuedCertificate);
IssuedCertificateSchema.index({ schoolSlug: 1, studentId: 1, issuedAt: -1 });
IssuedCertificateSchema.index({ schoolSlug: 1, certificateType: 1, issuedAt: -1 });
IssuedCertificateSchema.index(
  { studentId: 1, sourceType: 1, sourceId: 1 },
  { unique: true, partialFilterExpression: { sourceType: { $exists: true } } },
);
