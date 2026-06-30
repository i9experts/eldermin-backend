import { IsString, IsArray } from 'class-validator';

export class ActivateModuleDto {
  @IsString() moduleId: string;
}

export class DeactivateModuleDto {
  @IsString() moduleId: string;
}

export class BulkActivateDto {
  @IsArray() moduleIds: string[];
}
