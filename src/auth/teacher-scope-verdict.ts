import { ForbiddenException, Logger } from '@nestjs/common';

export type TeacherScopeMode = 'log' | 'enforce';
/** TEACHER_SCOPE_GUARD_MODE=enforce makes a would-deny a 403; anything else (default) only writes the structured `teacher_scope_guard` line. Read per request. */
export function teacherScopeGuardMode(): TeacherScopeMode {
  return String(process.env.TEACHER_SCOPE_GUARD_MODE || '').trim().toLowerCase() === 'enforce' ? 'enforce' : 'log';
}

const logger = new Logger('TeacherScopeGuard');

/**
 * One decision of a teacher-scope rule (attendance marking, homework submissions, marks entry): a structured, PII-free JSON line in both modes,
 * a 403 in enforce mode. Shared so every rule behind TEACHER_SCOPE_GUARD_MODE logs the same shape.
 */
export function teacherScopeVerdict(user: any, route: string, reason: string, message: string): void {
  const mode = teacherScopeGuardMode();
  logger.warn(JSON.stringify({
    event: 'teacher_scope_guard', mode, decision: mode === 'enforce' ? 'denied' : 'would_deny', reason, role: 'teacher', route,
    user: { userId: user?.userId, tenantId: user?.tenantId, schoolSlug: user?.schoolSlug },
  }));
  if (mode === 'enforce') throw new ForbiddenException(message);
}
