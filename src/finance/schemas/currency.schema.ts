// ============================================================
// MULTI-CURRENCY — Eldermin ERP | NestJS + MongoDB
// Phase 5 of the Odoo-standard finance rebuild: an optional, additive
// currency dimension. Every school implicitly operates in PKR today (no
// currency field existed anywhere before this phase) — that behavior is
// preserved exactly. A school may now define a Currency master (with
// exactly one marked isBaseCurrency), record point-in-time ExchangeRates
// against that base, and optionally tag specific accounts/transactions as
// foreign-currency. The ledger itself always stays single-currency (base
// currency) — foreign-currency documents convert into it at posting time
// via FinanceService.getRateOn, exactly like Odoo's own model. See
// claude/finance-module-odoo-standard-build-plan.md.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ============================================================
// CURRENCY — the master list of currencies a school has enabled, with
// exactly one flagged as the base/functional currency (enforced in
// FinanceService.setBaseCurrency, not just implied by the schema).
// ============================================================
export type CurrencyDocument = Currency & Document;

@Schema({ timestamps: true, collection: 'currencies' })
export class Currency {
  @Prop({ required: true }) code: string; // ISO 4217, e.g. PKR, USD, GBP, SAR
  @Prop({ required: true }) name: string;
  @Prop() symbol: string;
  @Prop({ default: 2 }) decimalPlaces: number;
  @Prop({ default: false }) isBaseCurrency: boolean;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const CurrencySchema = SchemaFactory.createForClass(Currency);
CurrencySchema.index({ schoolSlug: 1, code: 1 }, { unique: true });

// ============================================================
// EXCHANGE RATE — point-in-time rates (units of `toCurrency` per 1 unit of
// `fromCurrency`). In practice `toCurrency` is always the school's base
// currency, but the field is kept generic rather than hard-coded. Not
// unique per (schoolSlug, fromCurrency, rateDate) on purpose — a corrected
// rate can be entered for the same day; FinanceService.getRateOn always
// takes the most recent by createdAt among rates on/before the lookup date.
// ============================================================
export type ExchangeRateDocument = ExchangeRate & Document;

@Schema({ timestamps: true, collection: 'exchange_rates' })
export class ExchangeRate {
  @Prop({ required: true }) fromCurrency: string;
  @Prop({ required: true }) toCurrency: string;
  @Prop({ required: true }) rate: number; // units of toCurrency per 1 unit of fromCurrency
  @Prop({ required: true }) rateDate: Date;
  @Prop() source: string; // free label, e.g. "manual", "SBP" — no live-rate integration in Phase 5
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);
ExchangeRateSchema.index({ schoolSlug: 1, fromCurrency: 1, rateDate: -1 });
