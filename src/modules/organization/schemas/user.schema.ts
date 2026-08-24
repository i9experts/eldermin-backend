import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  // Not required — a Reseller Portal account (see resellerId below) is a
  // platform-level login, same as super_admin, with no school tenant at
  // all. Every existing user-creation path already supplies both fields,
  // so this relaxation changes no existing behavior.
  @Prop({ type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  email: string;

  // Real phone-based passwordless login (WhatsApp OTP) - a parent
  // account created this way is looked up by phone first on every
  // subsequent login, not re-derived from guardian records each time.
  // Optional/unset for every account created the normal email+password
  // way, so nothing existing changes behavior.
  @Prop()
  phone: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: { firstName: String, lastName: String, avatarUrl: String }, default: {} })
  profile: { firstName: string; lastName: string; avatarUrl?: string };

  @Prop({
    required: true,
    enum: ['super_admin','institution_owner','principal','vice_principal','admin',
           'academic_coordinator','finance_manager','hr_manager','teacher',
           'librarian','parent','student','support_staff',
           'reseller_admin','reseller_support'],
    default: 'admin',
  })
  primaryRole: string;

  // Eldermin Partner Network — Reseller Portal v1. Set only for
  // reseller_admin/reseller_support accounts; unset (and unused) for
  // every other role, same convention as guardianOfStudentIds below being
  // parent-only.
  @Prop({ type: Types.ObjectId, ref: 'Reseller', default: null })
  resellerId: Types.ObjectId | null;

  // Optional custom role (school-defined, module-level access) — when set,
  // this overrides the standard enum-based permission matrix entirely for
  // this user. Left unset, everyone keeps working exactly as before.
  @Prop({ type: Types.ObjectId, ref: 'Role', default: null })
  customRoleId: Types.ObjectId | null;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt: Date;

  // Forgot-password flow - stores a HASH of the reset token (never the raw
  // token itself), same principle as never storing a plain password.
  @Prop()
  resetPasswordTokenHash: string;

  @Prop()
  resetPasswordExpires: Date;

  // Real parent-to-student linkage - without this, a "parent" account
  // has no defined relationship to any student at all, which means
  // nothing can safely scope a parent-facing view to "only my own
  // child's data" without this field to check against. Set by an
  // admin/front-desk action when a guardian's login is created (see
  // linkGuardianToStudents), never inferred or guessed.
  @Prop({ type: [Types.ObjectId], ref: 'Student', default: [] })
  guardianOfStudentIds: Types.ObjectId[];

  // Same idea for a student's own login (a student themselves, not
  // their parent) - most schools won't use student logins at all yet,
  // but if/when they do, this is what a 'student' role account should
  // be scoped to.
  @Prop({ type: Types.ObjectId, ref: 'Student', default: null })
  linkedStudentId: Types.ObjectId | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
UserSchema.index({ phone: 1 }, { sparse: true });
