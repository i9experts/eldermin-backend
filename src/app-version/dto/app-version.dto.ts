import { IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import { APP_VERSION_APPS, APP_VERSION_PLATFORMS } from '../schemas/app-version.schema';
import { SEMVER_REGEX } from '../version.util';

const SEMVER_MSG = '$property must be a semantic version like 1.0.8';

export class AppVersionQueryDto {
  @IsIn(APP_VERSION_APPS as unknown as string[], { message: 'app must be one of: parent, teacher' })
  app: string;

  @IsIn(APP_VERSION_PLATFORMS as unknown as string[], { message: 'platform must be one of: android, ios' })
  platform: string;
}

export class UpdateAppVersionDto {
  @IsOptional() @Matches(SEMVER_REGEX, { message: SEMVER_MSG }) latestVersion?: string;
  @IsOptional() @Matches(SEMVER_REGEX, { message: SEMVER_MSG }) minVersion?: string;
  @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) storeUrl?: string;
  // null / '' clears the message.
  @IsOptional() @IsString() @MaxLength(500) updateMessage?: string | null;
}
