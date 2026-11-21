import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { CreateVisitRecordDto } from './create-visit-record.dto';

export class UpdateVisitRecordDto extends PartialType(CreateVisitRecordDto) {
  @IsOptional() @IsBoolean() followUpDone?: boolean;
}

export class AddFollowUpNoteDto {
  @IsString() text: string;
}
