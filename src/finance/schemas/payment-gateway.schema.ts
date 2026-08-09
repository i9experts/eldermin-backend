// ============================================================
// PAYMENT GATEWAY CONFIG — Eldermin ERP | NestJS + MongoDB
// Phase 8 of the Odoo-standard finance rebuild. Online fee payment via a
// gateway (Stripe / JazzCash / Easypaisa / HBL / ...) is explicitly flagged
// in the build plan as "a separate workstream, depends on which gateway the
// business decides to integrate." This schema is INTEGRATION-READY
// SCAFFOLDING only — no gateway is wired up, no real integration exists.
//
// IMPORTANT — `credentialsRef` is a placeholder string field (e.g. a label
// or a reference key into an external secrets manager), NOT actual secret
// storage. Real API keys/webhook secrets for a live gateway integration
// MUST live in a proper secrets manager (e.g. AWS Secrets Manager, Vault),
// never in a Mongo document — do not put live credentials in this field.
// See claude/finance-module-odoo-standard-build-plan.md.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentGatewayConfigDocument = PaymentGatewayConfig & Document;

@Schema({ timestamps: true, collection: 'payment_gateway_configs' })
export class PaymentGatewayConfig {
  @Prop({ required: true }) provider: string; // free-string, e.g. "stripe", "jazzcash", "easypaisa" — no fixed integration exists yet
  @Prop({ default: false }) isActive: boolean;
  // Placeholder reference only — see file-level comment. Never store a real secret here.
  @Prop() credentialsRef: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const PaymentGatewayConfigSchema = SchemaFactory.createForClass(PaymentGatewayConfig);
PaymentGatewayConfigSchema.index({ schoolSlug: 1 });
