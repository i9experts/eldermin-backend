import {
  IsArray, IsBoolean, IsDateString, IsMongoId, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class HygieneItemsDto {
  @IsOptional() @IsBoolean() uniform?: boolean;
  @IsOptional() @IsBoolean() capOrScarf?: boolean;
  @IsOptional() @IsBoolean() shoes?: boolean;
  @IsOptional() @IsBoolean() lunchBrought?: boolean;
}

export class LogHygieneCheckDto {
  @IsMongoId() studentId: string;
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsMongoId() campusId?: string;
  @IsDateString() date: string;
  @ValidateNested() @Type(() => HygieneItemsDto) items: HygieneItemsDto;
  @IsOptional() @IsString() notes?: string;
}

export class BulkLogHygieneDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LogHygieneCheckDto)
  records: LogHygieneCheckDto[];
}
