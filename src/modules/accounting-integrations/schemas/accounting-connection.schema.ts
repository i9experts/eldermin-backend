import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AccountingConnectionDocument = AccountingConnection & Document;

@Schema({ _id: false })
export class AccountMapping {
  @Prop({ required: true }) accountCode: string; // Eldermin ChartOfAccount.code
  @Prop({ required: true }) accountName: string; // Eldermin ChartOfAccount.name, denormalized for the mapping UI
  @Prop({ required: true }) externalAccountId: string; // e.g. QuickBooks Account.Id
  @Prop({ required: true }) externalAccountName: string;
}
export const AccountMappingSchema = SchemaFactory.createForClass(AccountMapping);

// One connection per (schoolSlug, platform) - each school connects its own
// accounting software account; this is never shared across tenants.
@Schema({ timestamps: true, collection: 'accounting_connections' })
export class AccountingConnection {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ enum: ['quickbooks_online'], required: true }) platform: string;
  @Prop({ enum: ['disconnected', 'connected', 'error'], default: 'disconnected' }) status: string;
  @Prop({ enum: ['sandbox', 'production'], default: 'sandbox' }) environment: string;

  // QuickBooks Online specifics - the "company" a QBO connection is scoped to.
  @Prop() realmId: string;
  // AES-256-GCM encrypted (see common/crypto/encryption.util.ts) - never
  // stored or logged in plaintext.
  @Prop() accessTokenEnc: string;
  @Prop() refreshTokenEnc: string;
  @Prop() tokenExpiresAt: Date;

  // CSRF/replay guard for the OAuth callback, which is necessarily a public
  // (unauthenticated) route - see AccountingIntegrationsController. Cleared
  // once the callback consumes it.
  @Prop() pendingStateNonce: string;
  @Prop() pendingStateExpiresAt: Date;

  @Prop({ type: [AccountMappingSchema], default: [] }) accountMappings: AccountMapping[];

  @Prop({ default: true }) autoSyncEnabled: boolean;
  @Prop() lastSyncedAt: Date;
  @Prop() lastError: string;

  @Prop() connectedBy: string;
  @Prop() connectedAt: Date;
  @Prop() disconnectedAt: Date;
}
export const AccountingConnectionSchema = SchemaFactory.createForClass(AccountingConnection);
AccountingConnectionSchema.index({ schoolSlug: 1, platform: 1 }, { unique: true });
