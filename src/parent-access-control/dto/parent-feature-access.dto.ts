import { IsArray, IsIn, IsOptional, IsString, ArrayMinSize } from 'class-validator';
import { PARENT_FEATURE_KEYS, ParentFeatureKey } from '../parent-feature.constants';

export class SetParentFeatureAccessDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(PARENT_FEATURE_KEYS, { each: true })
  features: ParentFeatureKey[];

  @IsIn(['suspend', 'restore'])
  action: 'suspend' | 'restore';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListRestrictedParentsQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;
}
