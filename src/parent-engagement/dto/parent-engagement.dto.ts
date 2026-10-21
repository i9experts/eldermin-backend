import {
  IsArray, IsBoolean, IsDateString, IsMongoId, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LogPickupDto {
  @IsMongoId() studentId: string;
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsMongoId() campusId?: string;
  @IsDateString() date: string;
  @IsOptional() @IsString() scheduledPickupTime?: string;
  @IsOptional() @IsString() actualPickupTime?: string;
  @IsOptional() @IsBoolean() markedLate?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class BulkLogPickupDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LogPickupDto)
  records: LogPickupDto[];
}
