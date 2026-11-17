import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// COURSE ENROLLMENT — LMS Phase 1
// The source of truth for who can see a 'manual' (elective/opt-in)
// enrollmentMode Syllabus - a course no longer has to be grade-locked to
// exist. An 'auto_by_class' syllabus (the default, and every syllabus
// that existed before this schema) never needs one of these: its
// visibility stays computed from grade/section/campus match exactly as
// before. See Syllabus.enrollmentMode.
// ============================================================
export type CourseEnrollmentDocument = CourseEnrollment & Document;

@Schema({ timestamps: true, collection: 'course_enrollments' })
export class CourseEnrollment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Syllabus' }) syllabusId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop() studentName: string;
  @Prop({ enum: ['active', 'dropped'], default: 'active' }) status: string;
  @Prop() enrolledBy: string;
  @Prop({ default: Date.now }) enrolledAt: Date;
  @Prop() droppedAt: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const CourseEnrollmentSchema = SchemaFactory.createForClass(CourseEnrollment);
// One enrollment row per student per course - re-enrolling after a drop
// updates this same row (status back to 'active') rather than creating a
// duplicate history row, matching LessonProgress's upsert convention.
CourseEnrollmentSchema.index({ syllabusId: 1, studentId: 1 }, { unique: true });
CourseEnrollmentSchema.index({ tenantId: 1, syllabusId: 1, status: 1 });
CourseEnrollmentSchema.index({ tenantId: 1, studentId: 1, status: 1 });
