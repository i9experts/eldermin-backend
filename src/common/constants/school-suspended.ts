import { ForbiddenException } from '@nestjs/common';

/** Intentionally reveals the SCHOOL's status (and only that): wrong credentials / inactive user stay generic. */
export const SCHOOL_SUSPENDED_MESSAGE = "This school's account is suspended — please contact your school";

/** Shown when a token of a school that was suspended AFTER sign-in is refused (R1). */
export const SCHOOL_SUSPENDED_TOKEN_MESSAGE = "Your school's account is currently suspended. Please contact your school administration.";

export const SCHOOL_SUSPENDED_CODE = 'SCHOOL_SUSPENDED';

/** 403 with a machine-readable code so the apps can show the dedicated screen instead of a generic error. */
export function schoolSuspendedException(message: string = SCHOOL_SUSPENDED_MESSAGE): ForbiddenException {
  return new ForbiddenException({ statusCode: 403, message, error: SCHOOL_SUSPENDED_CODE, code: SCHOOL_SUSPENDED_CODE });
}
