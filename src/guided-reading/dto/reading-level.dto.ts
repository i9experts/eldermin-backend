import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateReadingLevelDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() order: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateReadingLevelDto extends PartialType(CreateReadingLevelDto) {}
