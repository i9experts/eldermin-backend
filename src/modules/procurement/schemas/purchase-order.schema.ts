import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type PurchaseOrderDocument = PurchaseOrder & Document;

@Schema({ timestamps: true, collection: 'purchaseOrders' })
export class PurchaseOrder {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Campus' }) campusId: Types.ObjectId;
  @Prop({ required: true }) poNo: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Vendor' }) vendorId: Types.ObjectId;
  @Prop() vendorName: string;
  @Prop({ enum: ['goods','services','works','asset','it','maintenance','other'], default: 'goods' }) type: string;
  @Prop({ type: [{ itemNo: Number, description: String, quantity: Number, unit: String, unitPrice: Number, lineTotal: Number, _id: false }], default: [] }) lineItems: any[];
  @Prop({ required: true }) totalAmount: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop() requestedDeliveryDate: Date;
  @Prop({ enum: ['draft','pending_approval','approved','sent_to_vendor','partially_received','received','closed','cancelled'], default: 'draft' }) status: string;
  @Prop() notes: string;
  @Prop() issuedAt: Date;
}
export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
PurchaseOrderSchema.index({ tenantId: 1, poNo: 1 }, { unique: true });
PurchaseOrderSchema.index({ tenantId: 1, vendorId: 1, status: 1 });
