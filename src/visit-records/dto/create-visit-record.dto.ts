import {
  IsString, IsOptional, IsEnum, IsBoolean, IsArray, IsNumber,
  IsDateString, ValidateNested, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { InstitutionType, InterestLevel, TransportStatus } from '../schemas/visit-record.schema';

const INSTITUTION_TYPES: InstitutionType[] = [
  'school', 'college', 'university', 'coaching_centre',
  'technical_centre', 'tuition_centre', 'academy', 'other',
];
const INTEREST_LEVELS: InterestLevel[] = ['none', 'curious', 'interested', 'demo_scheduled', 'hot'];

class LocationDto {
  @IsNumber() lat: number;
  @IsNumber() lng: number;
  @IsOptional() @IsNumber() accuracyMeters?: number;
}

export class CreateVisitRecordDto {
  @IsOptional() @IsDateString() visitDate?: string;

  @IsString() @IsNotEmpty() institutionName: string;
  @IsEnum(INSTITUTION_TYPES) institutionType: InstitutionType;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() area?: string;

  @IsOptional() @ValidateNested() @Type(() => LocationDto) location?: LocationDto;
  @IsOptional() @IsString() photoUrl?: string;

  @IsOptional() @IsEnum(['budget', 'mid', 'premium']) feeTier?: string;
  @IsOptional() @IsEnum(['single', '2_3', '4_plus']) campusCount?: string;
  @IsOptional() @IsEnum(['under_50', '50_200', '200_500', '500_1000', '1000_plus']) studentCount?: string;
  @IsOptional() @IsEnum(['under_10', '10_30', '30_60', '60_plus']) staffCount?: string;

  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEnum(['owner', 'principal', 'admin', 'coordinator', 'teacher', 'other']) contactRole?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsBoolean() whatsappOk?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) bestTimeToContact?: string[];
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() socialOrWebsite?: string;

  @IsOptional() @IsEnum(['manual_register', 'excel', 'software', 'none']) currentSystem?: string;
  @IsOptional() @IsString() currentSystemName?: string;
  @IsOptional() @IsEnum(['own_fleet', 'outsourced', 'none']) transportStatus?: TransportStatus;
  @IsOptional() @IsEnum(['none', 'manual_calls', 'gps_app', 'other']) transportTrackingMethod?: string;
  @IsOptional() @IsEnum(['informal', 'structured', 'none']) feeConcessionPlans?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) admissionSeasons?: string[];

  @IsOptional() @IsEnum(INTEREST_LEVELS) elderminInterest?: InterestLevel;
  @IsOptional() @IsEnum(INTEREST_LEVELS) smartvanInterest?: InterestLevel;

  @IsOptional() @IsString() biggestProblem?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() nextFollowUpDate?: string;
}
