import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: { firstName: String, lastName: String, avatarUrl: String }, default: {} })
  profile: { firstName: string; lastName: string; avatarUrl?: string };

  @Prop({
    required: true,
    enum: ['super_admin','institution_owner','principal','vice_principal','admin',
           'academic_coordinator','finance_manager','hr_manager','teacher',
           'librarian','parent','student','support_staff'],
    default: 'admin',
  })
  primaryRole: string;

  // Optional custom role (school-defined, module-level access) — when set,
  // this overrides the standard enum-based permission matrix entirely for
  // this user. Left unset, everyone keeps working exactly as before.
  @Prop({ type: Types.ObjectId, ref: 'Role', default: null })
  customRoleId: Types.ObjectId | null;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
