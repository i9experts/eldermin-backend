import {
  IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsMongoId, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class ReaderKeywordDto {
  @IsString() word: string;
  @IsString() meaning: string;
  @IsOptional() @IsString() example?: string;
  @IsOptional() @IsNumber() pageNumber?: number;
}

export class ReaderPageDto {
  @IsNumber() pageNumber: number;
  @IsString() text: string;
  @IsOptional() @IsString() imageUrl?: string;
}

export class CreateReaderDto {
  @IsMongoId() levelId: string;
  @IsString() title: string;
  @IsOptional() @IsString() author?: string;
  @IsOptional() @IsString() synopsis?: string;

  @IsOptional() @IsString() coverImageUrl?: string;
  @IsOptional() @IsString() coverImageKey?: string;
  @IsOptional() @IsString() audioUrl?: string;
  @IsOptional() @IsString() audioKey?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReaderPageDto)
  pages?: ReaderPageDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReaderKeywordDto)
  keywords?: ReaderKeywordDto[];

  @IsOptional() @IsNumber() estimatedMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateReaderDto extends PartialType(CreateReaderDto) {}
