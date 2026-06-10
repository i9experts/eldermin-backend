import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type VendorDocument = Vendor & Document;

@Schema({ timestamps: true, collection: 'vendors' })
export class Vendor {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true }) vendorCode: string;
  @Prop({ required: true }) name: string;
  @Prop() legalName: string;
  @Prop({ enum: ['supplier','contractor','consultant','utility','maintenance','transport','catering','it_services','printing','other'], default: 'supplier' }) type: string;
  @Prop() registrationNo: string;
  @Prop() taxNo: string;
  @Prop({ required: true }) phone: string;
  @Prop({ required: true }) email: string;
  @Prop() website: string;
  @Prop({ type: { street: String, city: String, state: String, country: String, postalCode: String }, default: {} }) address: Record<string, any>;
  @Prop({ default: 30 }) paymentTermsDays: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ enum: ['pending_approval','approved','suspended','blacklisted','inactive'], default: 'pending_approval' }) status: string;
  @Prop({ type: { avgRating: { type: Number, default: 0 }, totalOrders: { type: Number, default: 0 }, onTimeDeliveryPct: { type: Number, default: 0 } }, default: {} }) performance: Record<string, any>;
  @Prop() notes: string;
  @Prop({ default: true }) isActive: boolean;
}
export const VendorSchema = SchemaFactory.createForClass(Vendor);
VendorSchema.index({ tenantId: 1, vendorCode: 1 }, { unique: true });
VendorSchema.index({ tenantId: 1, status: 1 });
