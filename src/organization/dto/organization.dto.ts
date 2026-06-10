import {
  IsString, IsOptional, IsEnum, IsBoolean, IsNumber,
  IsArray, IsDateString, IsMongoId, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class UpdateSchoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() nameUrdu?: string;
  @IsOptional() @IsString() logo?: string;
  @IsOptional() @IsString() motto?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(['school','college','university','madrassa','institute']) type?: string;
  @IsOptional() @IsEnum(['cambridge','matric','o_levels','a_levels','american','ib','mixed']) curriculum?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() address?: any;
  @IsOptional() social?: any;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsString() affiliationBoard?: string;
  @IsOptional() @IsNumber() establishedYear?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() multiCampus?: boolean;
  @IsOptional() @IsBoolean() hostelEnabled?: boolean;
  @IsOptional() @IsBoolean() transportEnabled?: boolean;
  @IsOptional() @IsNumber() termsPerYear?: number;
}

export class CreateCampusDto {
  @IsString() name: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() principalName?: string;
  @IsOptional() @IsMongoId() principalId?: string;
  @IsOptional() @IsNumber() capacity?: number;
  schoolSlug?: string;
}

export class CreateAcademicYearDto {
  @IsString() name: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
  @IsOptional() terms?: { name: string; startDate: string; endDate: string }[];
  schoolSlug?: string;
}

export class CreateGradeDto {
  @IsString() name: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsNumber() displayOrder?: number;
  @IsOptional() @IsString() campusId?: string;
  @IsOptional() sections?: { name: string; capacity?: number; classTeacher?: string }[];
  schoolSlug?: string;
}

export class CreateDepartmentDto {
  @IsString() name: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() head?: string;
  schoolSlug?: string;
}

export class CreateDesignationDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsEnum(['teaching','non_teaching','admin','management']) category?: string;
  schoolSlug?: string;
}
