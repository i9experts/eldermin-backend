import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PdfLogDocument = PdfLog & Document;

@Schema({ timestamps: true })
export class PdfLog {
  @Prop({ required: true }) schoolSlug: string;
  @Prop({
    required: true,
    enum: [
      'report-card', 'invoice', 'tarbiyah-report', 'admission-letter',
      'fee_receipt', 'payment_voucher', 'journal_voucher', 'expense_voucher',
      'payslip', 'result_card', 'attendance_sheet', 'custom',
    ],
  })
  type: string;
  @Prop({ required: true }) referenceId: string;
  @Prop() referenceName: string;
  @Prop({ required: true }) generatedBy: string;
  @Prop({ default: 'success', enum: ['success', 'failed'] }) status: string;
  @Prop() errorMessage: string;
  @Prop() fileSizeKb: number;
}

export const PdfLogSchema = SchemaFactory.createForClass(PdfLog);
