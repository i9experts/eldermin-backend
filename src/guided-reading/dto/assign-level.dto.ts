import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class AssignStudentLevelDto {
  @IsMongoId() levelId: string;
}

export class AssignClassLevelDto {
  @IsMongoId() levelId: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsMongoId() campusId?: string;
}
