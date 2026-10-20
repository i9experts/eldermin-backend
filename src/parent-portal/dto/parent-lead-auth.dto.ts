import { Type } from 'class-transformer';
import {
  IsArray, IsEmail, IsIn, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PARENT_LEAD_GRADES } from '../../leads/schemas/parent-lead.schema';

export class RegisterLeadChildDto {
  @IsString() @MaxLength(100) fullName: string;
  @IsOptional() @IsNumber() @Min(0) @Max(25) age?: number;
  @IsOptional() @IsIn(PARENT_LEAD_GRADES as unknown as string[]) grade?: string;
}

export class RegisterParentLeadDto {
  @IsString() @MaxLength(100) fullName: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
  @IsString() @MaxLength(150) schoolName: string;

  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RegisterLeadChildDto)
  children?: RegisterLeadChildDto[];
}

export class LoginParentLeadDto {
  @IsEmail() email: string;
  @IsString() password: string;
}
