import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CertificateTemplateDocument = CertificateTemplate & Document;

// Every certificate a school might realistically need to issue a student,
// worldwide - not just a Pakistani/Indian board's Transfer/Leaving
// Certificate, though that one gets a structured default body (see
// CertificatesService.defaultBodyFor) since it's the most legally rigid of
// the set. Schools pick the closest type and can still freely rewrite the
// body - this list only seeds a sensible starting template and filters the
// template picker, it never hard-locks a school out of blending fields
// across "types" if their own paperwork mixes them (e.g. a bonafide letter
// that also states conduct).
export const CERTIFICATE_TYPES = [
  'transfer', 'character', 'bonafide', 'provisional', 'migration',
  'merit', 'participation', 'attendance', 'graduation', 'custom',
] as const;

// Fields resolvable straight from the student's own record (see
// CertificatesService.mapStudentMergeFields) - always available as
// {{tokens}} in a template body regardless of certificateType.
export const STUDENT_MERGE_FIELDS = [
  'studentName', 'fatherName', 'motherName', 'guardianName', 'guardianContact',
  'admissionNo', 'grNo', 'grade', 'section', 'academicYear', 'dob', 'gender',
  'nationality', 'religion', 'admissionDate', 'campusName', 'schoolName',
  'issueDate', 'certificateNumber',
] as const;

// Extra, per-generation fields that can't come from the student record -
// a school fills these in at print time (see GenerateCertificateDto.extraFields).
// Grouped by the certificateType they're most relevant to, purely to drive
// the frontend's "fill in the blanks" form - the backend merges whatever
// is actually sent, so a school is never blocked from adding a field a
// type below doesn't list.
export const EXTRA_FIELD_SUGGESTIONS: Record<string, { key: string; label: string }[]> = {
  transfer: [
    { key: 'lastClassStudied', label: 'Last Class Studied' },
    { key: 'dateOfLeaving', label: 'Date of Leaving' },
    { key: 'reasonForLeaving', label: 'Reason for Leaving' },
    { key: 'conduct', label: 'Conduct' },
    { key: 'qualifiedForPromotion', label: 'Qualified for Promotion To' },
    { key: 'remarks', label: 'Remarks' },
  ],
  migration: [
    { key: 'dateOfLeaving', label: 'Date of Leaving' },
    { key: 'boardOrUniversity', label: 'Board / University' },
  ],
  merit: [
    { key: 'eventName', label: 'Event / Competition Name' },
    { key: 'eventDate', label: 'Event Date' },
    { key: 'position', label: 'Position / Achievement' },
  ],
  participation: [
    { key: 'eventName', label: 'Event / Activity Name' },
    { key: 'eventDate', label: 'Event Date' },
  ],
  attendance: [
    { key: 'periodLabel', label: 'Period (e.g. Academic Year 2025-26)' },
    { key: 'attendancePercentage', label: 'Attendance Percentage' },
  ],
  bonafide: [
    { key: 'purpose', label: 'Purpose (e.g. visa application, bank account)' },
  ],
  provisional: [
    { key: 'purpose', label: 'Purpose' },
  ],
  graduation: [
    { key: 'graduationYear', label: 'Graduation Year' },
    { key: 'division', label: 'Division / Grade' },
  ],
  character: [],
  custom: [],
};

@Schema({ _id: false })
export class Signatory {
  @Prop({ required: true }) label: string; // e.g. "Class Teacher", "Principal"
}
export const SignatorySchema = SchemaFactory.createForClass(Signatory);

// A school's own reusable, printable certificate design - selected per
// generation run (Student 360 -> Certificates), same purpose-built,
// pick-a-real-layout pattern as IdCardTemplate rather than a freeform
// canvas designer. Deliberately its own model rather than reusing
// ReportTemplate (a vertical block-stack with no border/watermark/
// signature-line/QR concepts) or IdCardTemplate (a fixed small CR80 card,
// not a full page of prose).
@Schema({ timestamps: true, collection: 'certificate_templates' })
export class CertificateTemplate {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true, enum: CERTIFICATE_TYPES }) certificateType: string;

  @Prop({ enum: ['portrait', 'landscape'], default: 'portrait' }) orientation: string;
  // 'formal': ornamental gold-on-navy border, serif feel - the classic
  // "certificate of achievement" look. 'classic'/'modern'/'minimal' are
  // plainer, letterhead-style documents better suited to a Transfer or
  // Bonafide Certificate than a decorative border would be.
  @Prop({ enum: ['formal', 'classic', 'modern', 'minimal'], default: 'formal' }) layoutStyle: string;

  @Prop({ default: '#0C447C' }) primaryColor: string;
  @Prop({ default: '#F5A623' }) accentColor: string;

  // Full-page watermark, same actual-feature (not just a declared-but-
  // dead field) as IdCardTemplate.backgroundImageUrl/Opacity - default
  // opacity is lower than the ID card's since it sits behind a whole page
  // of body text, not a small photo/field block.
  @Prop() backgroundImageUrl?: string;
  @Prop({ default: 0.06 }) backgroundImageOpacity: number;

  @Prop({ default: true }) showBorder: boolean;
  @Prop({ default: true }) showQrCode: boolean;
  @Prop({ default: false }) showSeal: boolean;
  @Prop() sealImageUrl?: string;

  // Rich HTML body with {{mergeField}} tokens (see STUDENT_MERGE_FIELDS /
  // EXTRA_FIELD_SUGGESTIONS) - a school edits real HTML (bold, paragraphs,
  // a table for a structured Transfer Certificate), not a rigid fixed
  // layout, since certificate wording is exactly the kind of thing every
  // school phrases differently and a rigid structure can't cover.
  @Prop({ required: true }) bodyTemplate: string;

  @Prop({ type: [SignatorySchema], default: [{ label: 'Class Teacher' }, { label: 'Principal' }] })
  signatories: Signatory[];

  @Prop() footerNote?: string;

  @Prop({ default: false }) isDefault: boolean;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true }) createdBy: string;
}

export const CertificateTemplateSchema = SchemaFactory.createForClass(CertificateTemplate);
CertificateTemplateSchema.index({ schoolSlug: 1, certificateType: 1 });
CertificateTemplateSchema.index({ schoolSlug: 1, certificateType: 1, isDefault: 1 });
