import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTicketDto {
  @IsString() @MaxLength(200)
  subject: string;

  @IsString() @MaxLength(5000)
  description: string;

  @IsOptional() @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsOptional() @IsString()
  category?: string;

  // Display-only convenience fields (not security-bearing — institutionSlug
  // for actual scoping comes from the authenticated user's JWT, not this).
  @IsOptional() @IsString()
  institutionName?: string;

  @IsOptional() @IsString()
  reportedByEmail?: string;
}
