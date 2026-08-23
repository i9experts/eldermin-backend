import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AppointmentLetterDocument = AppointmentLetter & Document;

// Distinct from OfferLetter (pre-joining, no staffId exists yet) and
// StaffContract (the formal, ongoing legal terms) - an Appointment
// Letter is the real-world document confirming someone's actual role
// and start on their joining date, issued once they genuinely exist as
// Staff, hence the required real link rather than a free-text name.
@Schema({ timestamps: true, collection: 'appointmentLetters' })
export class AppointmentLetter {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop() staffName: string;
  @Prop({ type: Types.ObjectId, ref: 'OfferLetter', default: null }) offerLetterId: Types.ObjectId | null;

  @Prop() appointmentNo: string;
  @Prop({ required: true }) designation: string;
  @Prop() department: string;
  @Prop({ required: true }) joiningDate: Date;
  @Prop() reportingTo: string;
  @Prop({ default: 3 }) probationPeriodMonths: number;
  @Prop({ required: true }) salary: number;
  @Prop({ default: 'PKR' }) currency: string;
  @Prop() workingHoursPerWeek: number;
  @Prop() additionalTerms: string;

  @Prop({ enum: ['draft','issued','acknowledged'], default: 'draft' }) status: string;
  @Prop() issuedAt: Date;
  @Prop() acknowledgedAt: Date;

  @Prop() pdfS3Key: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}

export const AppointmentLetterSchema = SchemaFactory.createForClass(AppointmentLetter);
AppointmentLetterSchema.index({ schoolSlug: 1, appointmentNo: 1 }, { unique: true, sparse: true });
AppointmentLetterSchema.index({ schoolSlug: 1, staffId: 1 });
