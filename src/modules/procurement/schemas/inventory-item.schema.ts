import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type InventoryItemDocument = InventoryItem & Document;

@Schema({ timestamps: true, collection: 'inventoryItems' })
export class InventoryItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true }) itemCode: string;
  @Prop({ required: true }) name: string;
  @Prop() brand: string;
  @Prop({ enum: ['stationery','lab_supplies','sports','cleaning','it_consumable','cafeteria','medical','printing','books','uniform','maintenance','other'], default: 'stationery' }) category: string;
  @Prop({ required: true }) primaryUnit: string;
  @Prop({ default: 0 }) totalStock: number;
  @Prop({ default: 0 }) reorderPoint: number;
  @Prop({ default: 0 }) standardCost: number;
  @Prop({ default: true }) isActive: boolean;
}
export const InventoryItemSchema = SchemaFactory.createForClass(InventoryItem);
InventoryItemSchema.index({ tenantId: 1, itemCode: 1 }, { unique: true });
InventoryItemSchema.index({ tenantId: 1, totalStock: 1, reorderPoint: 1 });
