import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoardMemberDocument = BoardMember & Document;

@Schema({ timestamps: true, collection: 'boardMembers' })
export class BoardMember {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop()
  email: string;

  @Prop()
  phone: string;

  @Prop({ enum: ['chairperson', 'vice_chairperson', 'secretary', 'treasurer', 'member', 'advisor'], default: 'member' })
  boardRole: string;

  @Prop()
  expertise: string;

  @Prop()
  organization: string;

  @Prop()
  joinedAt: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const BoardMemberSchema = SchemaFactory.createForClass(BoardMember);
BoardMemberSchema.index({ tenantId: 1, email: 1 }, { sparse: true });
