import {
  IsString, IsOptional, IsNumber, IsArray, IsEnum, IsBoolean,
  ValidateNested, IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SyllabusSubTopicDto {
  @IsNumber() subTopicNo: number;
  @IsString() subTopicName: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() plannedWeek?: number;
}

export class SyllabusTopicDto {
  @IsNumber() topicNo: number;
  @IsString() topicName: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) learningObjectives?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sloReferences?: string[];
  @IsOptional() @IsString() assessmentType?: string;
  @IsOptional() @IsNumber() pageFrom?: number;
  @IsOptional() @IsNumber() pageTo?: number;
  @IsOptional() @IsNumber() estimatedLessons?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyllabusSubTopicDto)
  subTopics?: SyllabusSubTopicDto[];
}

export class SyllabusUnitDto {
  @IsNumber() unitNo: number;
  @IsString() unitName: string;
  @IsOptional() @IsNumber() weeks?: number;
  @IsOptional() @IsNumber() periods?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyllabusTopicDto)
  topics?: SyllabusTopicDto[];
}

export class AssessmentBreakdownDto {
  @IsOptional() @IsNumber() midTerm?: number;
  @IsOptional() @IsNumber() finalExam?: number;
  @IsOptional() @IsNumber() classwork?: number;
  @IsOptional() @IsNumber() homework?: number;
}

export class CreateSyllabusDto {
  @IsString() subjectName: string;
  @IsOptional() @IsMongoId() subjectId?: string;
  @IsString() gradeLevel: string;
  @IsOptional() @IsString() sectionName?: string;
  @IsString() academicYearLabel: string;
  @IsOptional() @IsString() term?: string;
  @IsOptional() @IsEnum(['cambridge', 'ib', 'national', 'american', 'custom']) framework?: string;
  @IsOptional() @IsString() recommendedTextbook?: string;
  @IsOptional() @IsString() publisherName?: string;
  @IsOptional() @IsString() edition?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyllabusUnitDto)
  units?: SyllabusUnitDto[];
  @IsOptional() @ValidateNested() @Type(() => AssessmentBreakdownDto) assessmentBreakdown?: AssessmentBreakdownDto;
  @IsOptional() @IsMongoId() teacherId?: string;
  @IsOptional() @IsString() teacherName?: string;
}

export class UpdateSyllabusDto {
  @IsOptional() @IsString() subjectName?: string;
  @IsOptional() @IsString() gradeLevel?: string;
  @IsOptional() @IsString() sectionName?: string;
  @IsOptional() @IsString() academicYearLabel?: string;
  @IsOptional() @IsString() term?: string;
  @IsOptional() @IsEnum(['cambridge', 'ib', 'national', 'american', 'custom']) framework?: string;
  @IsOptional() @IsString() recommendedTextbook?: string;
  @IsOptional() @IsString() publisherName?: string;
  @IsOptional() @IsString() edition?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyllabusUnitDto)
  units?: SyllabusUnitDto[];
  @IsOptional() @ValidateNested() @Type(() => AssessmentBreakdownDto) assessmentBreakdown?: AssessmentBreakdownDto;
  @IsOptional() @IsMongoId() teacherId?: string;
  @IsOptional() @IsString() teacherName?: string;
  @IsOptional() @IsEnum(['draft', 'active', 'approved', 'archived']) status?: string;
}

export class MarkTopicDto {
  @IsNumber() unitNo: number;
  @IsNumber() topicNo: number;
  @IsBoolean() isCovered: boolean;
  @IsOptional() @IsString() coveredBy?: string;
  @IsOptional() @IsNumber() actualLessonsUsed?: number;
  @IsOptional() @IsString() notes?: string;
}

export class MarkSubTopicDto {
  @IsNumber() unitNo: number;
  @IsNumber() topicNo: number;
  @IsNumber() subTopicNo: number;
  @IsBoolean() isCovered: boolean;
  @IsOptional() @IsString() coveredBy?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ApproveSyllabusDto {
  @IsString() approverName: string;
}

export class SyllabusQueryDto {
  @IsOptional() @IsString() gradeLevel?: string;
  @IsOptional() @IsString() sectionName?: string;
  @IsOptional() @IsString() subjectName?: string;
  @IsOptional() @IsString() academicYearLabel?: string;
  @IsOptional() @IsString() term?: string;
  @IsOptional() @IsMongoId() teacherId?: string;
  @IsOptional() @IsEnum(['draft', 'active', 'approved', 'archived']) status?: string;
  @IsOptional() @IsEnum(['not_started', 'on_track', 'behind', 'completed']) trackStatus?: string;
}
