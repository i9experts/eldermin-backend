import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GroupInstitutionDocument = GroupInstitution & Document;

@Schema({ _id: false })
class GroupInstitutionAddress {
  @Prop() country: string;
  @Prop() province: string;
  @Prop() city: string;
  @Prop() postalCode: string;
  @Prop() fullAddress: string;
}

@Schema({ timestamps: true, collection: 'group_institutions' })
export class GroupInstitution {
  @Prop({ required: true })
  schoolSlug: string;

  // Step 1 — Basic Info
  @Prop({ required: true }) name: string;
  @Prop() legalName: string;
  @Prop() registrationNumber: string;
  @Prop() type: string;
  @Prop() ownershipType: string;
  @Prop() establishedDate: Date;
  @Prop({ enum: ['Active', 'Pending', 'Inactive'], default: 'Active' })
  status: string;
  @Prop() logoUrl: string;

  // Step 2 — Location
  @Prop({ type: GroupInstitutionAddress, default: {} })
  address: GroupInstitutionAddress;
  @Prop() regionalOffice: string;

  // Step 3 — Contact
  @Prop() email: string;
  @Prop() phone: string;
  @Prop() website: string;
  @Prop() taxNumber: string;
  @Prop() principalName: string;
  @Prop() headEmail: string;
}

export const GroupInstitutionSchema = SchemaFactory.createForClass(GroupInstitution);
GroupInstitutionSchema.index({ schoolSlug: 1 });
