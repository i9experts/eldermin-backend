import { IsIn, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLeadDto {
  @IsOptional()
  @IsIn(['new', 'contacted', 'demo_scheduled', 'trial', 'converted', 'lost'])
  stage?: 'new' | 'contacted' | 'demo_scheduled' | 'trial' | 'converted' | 'lost';

  @IsOptional() @IsMongoId()
  assignedTo?: string;
}

export class AddLeadNoteDto {
  @IsString() @MaxLength(2000)
  text: string;
}
