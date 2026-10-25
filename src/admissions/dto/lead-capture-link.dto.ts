// ============================================================
// DTOs — Public Lead Capture Form / Shareable Links
// Eldermin ERP | NestJS
// ============================================================

import { IsString, IsOptional, IsEmail, IsMongoId } from 'class-validator';

export class CreateLeadCaptureLinkDto {
  @IsOptional() @IsMongoId() campusId?: string;
}

export class PublicLeadFormSubmitDto {
  @IsString() firstName: string;
  @IsString() lastName: string;

  @IsOptional() @IsEmail() email?: string;
  @IsString() phone: string;

  @IsString() gradeInterested: string;

  @IsOptional() @IsString() campusPreference?: string;
  @IsOptional() @IsString() notes?: string;

  // Honeypot — a field real applicants never see or fill in (hidden via
  // CSS on the public form). Bots that blindly fill every input tend to
  // fill this one. A non-empty value here means "fake-accept, don't
  // actually create a Lead" rather than a hard error, since erroring
  // just teaches the bot to leave this field blank next time.
  @IsOptional() @IsString() website?: string;
}
