import { IsString, IsOptional, IsArray, ValidateNested, IsIn, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class PlatformModuleAccessDto {
  @IsString() @IsNotEmpty() tabKey: string;
  @IsIn(['view', 'manage']) level: 'view' | 'manage';
  @IsOptional() @IsString() subTabKey?: string;
}

export class CreatePlatformRoleDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PlatformModuleAccessDto)
  moduleAccess: PlatformModuleAccessDto[];
}

export class UpdatePlatformRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlatformModuleAccessDto)
  moduleAccess?: PlatformModuleAccessDto[];
}

export class AssignPlatformRoleDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsOptional() @IsString() roleId?: string; // omit/null to unassign (unrestricted super_admin)
}

export class CreatePlatformStaffDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsString() @IsNotEmpty() email: string;
  @IsOptional() @IsString() roleId?: string;
}
