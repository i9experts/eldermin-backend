import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class MealRecord {
  @Prop({ required: true, enum: ['breakfast', 'lunch', 'snack'] }) type: string;
  @Prop({ required: true, enum: ['all', 'most', 'some', 'none', 'refused'] }) amountEaten: string;
  @Prop() notes: string;
}
export const MealRecordSchema = SchemaFactory.createForClass(MealRecord);

@Schema({ _id: false })
export class NapRecord {
  @Prop() startTime: string;
  @Prop() endTime: string;
  @Prop({ enum: ['restful', 'restless', 'none'] }) quality: string;
}
export const NapRecordSchema = SchemaFactory.createForClass(NapRecord);

@Schema({ _id: false })
export class ToiletingRecord {
  @Prop({ required: true }) time: string;
  @Prop({ required: true, enum: ['wet', 'dry', 'bm', 'accident'] }) type: string;
  @Prop() notes: string;
}
export const ToiletingRecordSchema = SchemaFactory.createForClass(ToiletingRecord);

@Schema({ _id: false })
export class MedicationRecord {
  @Prop({ required: true }) name: string;
  @Prop() dose: string;
  @Prop({ required: true }) time: string;
  @Prop({ required: true }) givenBy: string;
}
export const MedicationRecordSchema = SchemaFactory.createForClass(MedicationRecord);

@Schema({ _id: false })
export class MinorInjuryRecord {
  @Prop({ required: true }) description: string;
  @Prop() bodyPart: string;
  @Prop({ required: true }) time: string;
  @Prop() firstAidGiven: string;
  @Prop({ default: false }) parentNotified: boolean;
}
export const MinorInjuryRecordSchema = SchemaFactory.createForClass(MinorInjuryRecord);

export type ECECareRecordDocument = ECECareRecord & Document;

// Deliberately a separate collection from ECEObservation (educational
// assessment) - meals, sleep, toileting, mood, medication, and minor
// injuries are care/wellbeing data, not development evidence, and
// conflating the two would blur what each is actually for. Allergy
// information is never duplicated here - it's read live from the real
// Student.allergies field wherever it needs to be shown (e.g. before
// giving a snack), since a second copy would inevitably drift out of
// sync with the one place a parent/nurse actually updates it.
@Schema({ timestamps: true, collection: 'ece_care_records' })
export class ECECareRecord {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop({ required: true }) date: Date;
  @Prop({ enum: ['happy', 'calm', 'upset', 'tired', 'unwell'] }) arrivalMood: string;
  @Prop({ enum: ['happy', 'calm', 'upset', 'tired', 'unwell'] }) departureMood: string;
  @Prop({ type: [MealRecordSchema], default: [] }) meals: MealRecord[];
  @Prop({ enum: ['good', 'adequate', 'low'] }) waterIntake: string;
  @Prop({ type: [NapRecordSchema], default: [] }) naps: NapRecord[];
  @Prop({ type: [ToiletingRecordSchema], default: [] }) toileting: ToiletingRecord[];
  @Prop({ type: [MedicationRecordSchema], default: [] }) medicationGiven: MedicationRecord[];
  @Prop() healthObservation: string; // free text - fever, cough, rash etc
  @Prop({ type: [MinorInjuryRecordSchema], default: [] }) minorInjuries: MinorInjuryRecord[];
  @Prop() comfortingNotes: string;
  @Prop({ required: true }) recordedBy: string;
}

export const ECECareRecordSchema = SchemaFactory.createForClass(ECECareRecord);
ECECareRecordSchema.index({ schoolSlug: 1, studentId: 1, date: -1 });
ECECareRecordSchema.index({ schoolSlug: 1, date: -1 });
