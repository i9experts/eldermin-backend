import { IsMongoId } from 'class-validator';

export class AssignStudentLevelDto {
  @IsMongoId() levelId: string;
}
