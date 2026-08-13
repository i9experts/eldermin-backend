import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ============================================================
// PHONE OTP — WhatsApp-based passwordless login for the Parent App.
// A parent enters their registered WhatsApp number, gets a real 6-digit
// code sent via WhatsApp (once a real WABA account is connected - see
// whatsapp.service.ts), and verifying it issues a normal JWT exactly
// like email+password login does. The code itself is never stored in
// plaintext - only its hash, same principle as passwordHash.
// ============================================================

export type PhoneOtpDocument = PhoneOtp & Document;

@Schema({ timestamps: true, collection: 'phone_otps' })
export class PhoneOtp {
  @Prop({ required: true, index: true }) phone: string; // normalized, e.g. +923001234567
  @Prop({ required: true }) codeHash: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ default: null }) consumedAt: Date | null;
  // What actually happened when we tried to send it - honest, same
  // pattern as every other WhatsApp/SMS attempt in this app.
  @Prop() sendStatus: string;
  @Prop() sendReason: string;
}
export const PhoneOtpSchema = SchemaFactory.createForClass(PhoneOtp);
PhoneOtpSchema.index({ phone: 1, createdAt: -1 });
// TTL index - Mongo automatically deletes documents past this date, so
// old OTPs don't pile up forever.
PhoneOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
