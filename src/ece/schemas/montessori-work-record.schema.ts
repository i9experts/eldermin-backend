import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MontessoriWorkRecordDocument = MontessoriWorkRecord & Document;

// One record per child per material. Deliberately self-contained rather
// than cross-linking every practice log into a full ECEObservation - the
// observationType 'montessori_presentation' enum value already exists on
// ECEObservation for schools that want a presentation to also appear in
// the child's general observation timeline, but that cross-wiring is a
// deliberate follow-up rather than required for this to be genuinely
// useful on its own (same pragmatic scoping used throughout this module).
@Schema({ timestamps: true, collection: 'ece_montessori_work_records' })
export class MontessoriWorkRecord {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'MontessoriMaterial' }) materialId: Types.ObjectId;
  @Prop({
    required: true,
    enum: ['presented', 'practising', 'repeated_independently', 'needs_representation', 'mastered', 'ready_for_extension'],
    default: 'presented',
  })
  status: string;
  @Prop({ required: true }) presentationDate: Date;
  @Prop({ default: 0 }) practiceCount: number;
  @Prop({ type: [String], default: [] }) observationNotes: string[]; // "2026-08-10: Independent, confident with all ten cylinders"
  @Prop({ required: true }) presentedBy: string;
}

export const MontessoriWorkRecordSchema = SchemaFactory.createForClass(MontessoriWorkRecord);
MontessoriWorkRecordSchema.index({ schoolSlug: 1, studentId: 1, materialId: 1 }, { unique: true });
