import {
  IsArray, IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AssignHomeTaskDto {
  @IsArray() @IsMongoId({ each: true }) studentIds: string[]; // single assign = array of 1; bulk = whole class/section
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() traitKey?: string;
  @IsDateString() assignedDate: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class CompleteHomeTaskDto {
  @IsOptional() @IsString() @MaxLength(1000) parentNotes?: string;
}

export class ReviewHomeTaskDto {
  @IsNumber() @Min(1) @Max(5) reviewRating: number;
  @IsOptional() @IsString() @MaxLength(1000) reviewNotes?: string;
}
