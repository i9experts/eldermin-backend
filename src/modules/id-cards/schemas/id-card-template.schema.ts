import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type IdCardTemplateDocument = IdCardTemplate & Document;

// The set of optional fields a school can toggle on/off per template,
// keyed separately per entity type since students and staff don't share
// the same identity fields. 'photo', 'name', the class/section (students)
// or designation/department (staff) subtitle line, and the primary ID
// number (GR # / admission # for students, employee ID for staff) are
// ALWAYS shown automatically - not toggleable, and deliberately excluded
// from these lists (a toggle for a field that's already unconditionally
// rendered would silently do nothing, since the mapped card data has no
// separate property for it to bind to). Everything here is opt-in on top
// of that baseline.
export const STUDENT_ID_CARD_FIELDS = [
  'dob', 'bloodGroup', 'address', 'guardianContact',
] as const;
export const STAFF_ID_CARD_FIELDS = [
  'phone', 'bloodGroup', 'joiningDate',
] as const;

// A school's own reusable, printable ID card design - selected per batch
// print run (Student Directory / HR Staff Directory -> "ID Cards"), not a
// one-off. Deliberately a SEPARATE model from ReportTemplate: that engine
// is a vertical block-stack designed for A4/A5/Letter documents (receipts,
// vouchers, payslips) with no absolute positioning, no photo element, and
// no real small/custom page size support - forcing a CR80 card (a fixed
// 85.6x54mm physical size, photo-centric, front+back) through it would
// mean fighting the renderer rather than using it. This lives alongside
// Report Templates in the UI (same nav group) but is its own purpose-built
// layout engine tailored to card printing specifically.
@Schema({ timestamps: true, collection: 'id_card_templates' })
export class IdCardTemplate {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, enum: ['student', 'staff'] }) entityType: string;
  @Prop({ required: true }) name: string;

  // Three real, visually distinct CSS layouts - not just a label - see
  // id-cards.service.ts's buildCardHtml(). Chosen over a freeform
  // drag-and-drop canvas: gives a school a genuinely professional result
  // immediately, matching the same "pick from real, standardised layouts"
  // pattern already used for exam paper formats, rather than an
  // open-ended designer most admins would never fully use.
  @Prop({ required: true, enum: ['classic', 'modern', 'minimal'], default: 'classic' })
  layoutStyle: string;

  @Prop({ default: '#0C447C' }) primaryColor: string;
  @Prop({ default: '#F5A623' }) accentColor: string;

  // Optional custom background image for the card face (e.g. a school
  // watermark/pattern) - falls back to a solid primaryColor header band
  // when unset.
  @Prop() backgroundImageUrl?: string;

  // Which optional fields (beyond the always-shown photo+name) this
  // template prints - see STUDENT_ID_CARD_FIELDS / STAFF_ID_CARD_FIELDS.
  @Prop({ type: [String], default: [] }) showFields: string[];

  @Prop({ default: true }) showQrCode: boolean;
  @Prop({ default: false }) showBarcode: boolean;
  @Prop({ default: true }) showSignatureLine: boolean;

  // Free-text validity line (e.g. "Valid till 30 June 2027" or
  // "Academic Year 2026-27") - schools use very different conventions
  // here (calendar year, academic year, indefinite until reissued), so a
  // single free-text field beats guessing a rigid date format.
  @Prop() validityText?: string;

  @Prop({ default: false }) isDefault: boolean;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true }) createdBy: string;
}

export const IdCardTemplateSchema = SchemaFactory.createForClass(IdCardTemplate);
IdCardTemplateSchema.index({ schoolSlug: 1, entityType: 1 });
IdCardTemplateSchema.index({ schoolSlug: 1, entityType: 1, isDefault: 1 });
