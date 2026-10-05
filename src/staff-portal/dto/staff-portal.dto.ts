import { IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength, IsBoolean } from 'class-validator';

export class SendThreadMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) body: string;
}

export class CreateStaffThreadDto {
  @IsMongoId() studentId: string;
  @IsMongoId() guardianUserId: string;
  @IsString() @MinLength(1) @MaxLength(200) subject: string;
  @IsString() @MinLength(1) @MaxLength(4000) firstMessage: string;
}

export class ReviewStudentLeaveDto {
  @IsIn(['approved', 'rejected']) status: 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class RegisterDeviceTokenDto {
  @IsString() @MinLength(10) @MaxLength(4096) token: string;
  @IsIn(['android', 'ios']) platform: 'android' | 'ios';
  @IsOptional() @IsString() @MaxLength(200) deviceId?: string;
  @IsOptional() @IsString() @MaxLength(50) appVersion?: string;
}

export class RemoveDeviceTokenDto {
  @IsString() @MinLength(10) @MaxLength(4096) token: string;
}

export class AccountDeleteRequestDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsBoolean() confirm: boolean;
}
