// ============================================================
// REPORT TEMPLATE SCHEMA — Custom letterheads/layouts for printed documents
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReportTemplateDocument = ReportTemplate & Document;

export const REPORT_TEMPLATE_TYPES = [
  'fee_receipt',
  'payment_voucher',
  'journal_voucher',
  'expense_voucher',
  'payslip',
  'result_card',
  'attendance_sheet',
  'admission_letter',
  'custom',
] as const;

// ── Nested: Letterhead ───────────────────────────────────────
@Schema({ _id: false })
class LetterheadTextConfig {
  @Prop({ default: true }) show: boolean;
  @Prop({ default: 20 }) fontSize: number;
  @Prop({ default: true }) bold: boolean;
  @Prop({ default: '#0C447C' }) color: string;
}
const LetterheadTextConfigSchema = SchemaFactory.createForClass(LetterheadTextConfig);

@Schema({ _id: false })
class LetterheadAddressConfig {
  @Prop({ default: true }) show: boolean;
  @Prop({ default: 11 }) fontSize: number;
}
const LetterheadAddressConfigSchema = SchemaFactory.createForClass(LetterheadAddressConfig);

@Schema({ _id: false })
class LetterheadShowConfig {
  @Prop({ default: true }) show: boolean;
}
const LetterheadShowConfigSchema = SchemaFactory.createForClass(LetterheadShowConfig);

@Schema({ _id: false })
class LetterheadTaglineConfig {
  @Prop({ default: false }) show: boolean;
  @Prop({ default: '' }) text: string;
}
const LetterheadTaglineConfigSchema = SchemaFactory.createForClass(LetterheadTaglineConfig);

@Schema({ _id: false })
class Letterhead {
  @Prop({ default: true }) showLogo: boolean;
  @Prop({ enum: ['left', 'center', 'right'], default: 'left' }) logoPosition: string;
  @Prop({ enum: ['small', 'medium', 'large'], default: 'medium' }) logoSize: string;

  @Prop({ type: LetterheadTextConfigSchema, default: () => ({}) })
  schoolName: LetterheadTextConfig;

  @Prop({ type: LetterheadAddressConfigSchema, default: () => ({}) })
  schoolAddress: LetterheadAddressConfig;

  @Prop({ type: LetterheadShowConfigSchema, default: () => ({}) })
  schoolPhone: LetterheadShowConfig;

  @Prop({ type: LetterheadShowConfigSchema, default: () => ({}) })
  schoolEmail: LetterheadShowConfig;

  @Prop({ type: LetterheadShowConfigSchema, default: () => ({ show: false }) })
  schoolWebsite: LetterheadShowConfig;

  @Prop({ type: LetterheadTaglineConfigSchema, default: () => ({}) })
  tagline: LetterheadTaglineConfig;

  @Prop({ enum: ['none', 'single', 'double', 'shadow'], default: 'single' })
  borderStyle: string;

  @Prop({ default: '#ffffff' }) backgroundColor: string;
  @Prop({ default: '#0C447C' }) primaryColor: string;
  @Prop({ default: '#EF9F27' }) accentColor: string;
}
const LetterheadSchema = SchemaFactory.createForClass(Letterhead);

// ── Nested: Header ───────────────────────────────────────────
@Schema({ _id: false })
class HeaderTitleConfig {
  @Prop({ default: true }) show: boolean;
  @Prop() text: string;
  @Prop({ default: 16 }) fontSize: number;
  @Prop({ enum: ['left', 'center', 'right'], default: 'center' }) alignment: string;
}
const HeaderTitleConfigSchema = SchemaFactory.createForClass(HeaderTitleConfig);

@Schema({ _id: false })
class HeaderSubtitleConfig {
  @Prop({ default: false }) show: boolean;
  @Prop({ default: '' }) text: string;
}
const HeaderSubtitleConfigSchema = SchemaFactory.createForClass(HeaderSubtitleConfig);

@Schema({ _id: false })
class HeaderCustomField {
  @Prop() label: string;
  @Prop() field: string;
  @Prop({ enum: ['left', 'right'], default: 'left' }) position: string;
}
const HeaderCustomFieldSchema = SchemaFactory.createForClass(HeaderCustomField);

@Schema({ _id: false })
class Header {
  @Prop({ type: HeaderTitleConfigSchema, default: () => ({}) })
  title: HeaderTitleConfig;

  @Prop({ type: HeaderSubtitleConfigSchema, default: () => ({}) })
  subtitle: HeaderSubtitleConfig;

  @Prop({ default: true }) showDocumentNumber: boolean;
  @Prop({ default: true }) showDate: boolean;
  @Prop({ default: false }) showAcademicYear: boolean;

  @Prop({ type: [HeaderCustomFieldSchema], default: [] })
  customFields: HeaderCustomField[];
}
const HeaderSchema = SchemaFactory.createForClass(Header);

// ── Nested: Section ───────────────────────────────────────────
@Schema({ _id: false })
class ReportSection {
  @Prop() id: string;

  @Prop({
    enum: ['table', 'key_value', 'text', 'signature_block', 'divider', 'spacer', 'qr_code'],
    required: true,
  })
  type: string;

  @Prop({ default: 0 }) order: number;
  @Prop({ default: true }) visible: boolean;

  @Prop({ type: Object, default: {} })
  config: Record<string, any>;
}
const ReportSectionSchema = SchemaFactory.createForClass(ReportSection);

// ── Nested: Footer ───────────────────────────────────────────
@Schema({ _id: false })
class Footer {
  @Prop({ default: false }) showPageNumber: boolean;
  @Prop({ default: true }) showPrintDate: boolean;
  @Prop({ default: '' }) leftText: string;
  @Prop({ default: '' }) centerText: string;
  @Prop({ default: '' }) rightText: string;
  @Prop({ default: true }) showSignatureLines: boolean;
  @Prop({ type: [String], default: [] }) signatureLabels: string[];
  @Prop({ default: false }) showStampArea: boolean;
  @Prop({ default: true }) borderTop: boolean;
}
const FooterSchema = SchemaFactory.createForClass(Footer);

// ── Nested: Page ──────────────────────────────────────────────
@Schema({ _id: false })
class Watermark {
  @Prop({ default: false }) show: boolean;
  @Prop({ default: '' }) text: string;
  @Prop({ default: 0.08 }) opacity: number;
}
const WatermarkSchema = SchemaFactory.createForClass(Watermark);

@Schema({ _id: false })
class Page {
  @Prop({ enum: ['A4', 'A5', 'Letter', 'custom'], default: 'A4' }) size: string;
  @Prop({ enum: ['portrait', 'landscape'], default: 'portrait' }) orientation: string;
  @Prop({ default: 15 }) marginTop: number;
  @Prop({ default: 15 }) marginBottom: number;
  @Prop({ default: 15 }) marginLeft: number;
  @Prop({ default: 15 }) marginRight: number;

  @Prop({ type: WatermarkSchema, default: () => ({}) })
  watermark: Watermark;
}
const PageSchema = SchemaFactory.createForClass(Page);

// ── Main: ReportTemplate ──────────────────────────────────────
@Schema({ timestamps: true, collection: 'report_templates' })
export class ReportTemplate {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ default: '' }) tenantId: string;

  @Prop({ required: true }) name: string;

  @Prop({
    enum: REPORT_TEMPLATE_TYPES,
    required: true,
    index: true,
  })
  type: string;

  @Prop({ default: false }) isDefault: boolean;
  @Prop({ default: true }) isActive: boolean;

  @Prop({ type: LetterheadSchema, default: () => ({}) })
  letterhead: Letterhead;

  @Prop({ type: HeaderSchema, default: () => ({}) })
  header: Header;

  @Prop({ type: [ReportSectionSchema], default: [] })
  sections: ReportSection[];

  @Prop({ type: FooterSchema, default: () => ({}) })
  footer: Footer;

  @Prop({ type: PageSchema, default: () => ({}) })
  page: Page;
}

export const ReportTemplateSchema = SchemaFactory.createForClass(ReportTemplate);

ReportTemplateSchema.index({ schoolSlug: 1, type: 1 });
ReportTemplateSchema.index({ schoolSlug: 1, isDefault: 1, type: 1 });
