import { IsString, IsOptional, IsArray, ValidateNested, IsIn, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class ModuleAccessDto {
  @IsString() @IsNotEmpty() moduleKey: string;
  @IsIn(['view', 'manage']) level: 'view' | 'manage';
}

export class CreateRoleDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ModuleAccessDto)
  moduleAccess: ModuleAccessDto[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ModuleAccessDto)
  moduleAccess?: ModuleAccessDto[];
}

export class AssignRoleDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsOptional() @IsString() roleId?: string; // omit/null to unassign (revert to standard enum role)
}
