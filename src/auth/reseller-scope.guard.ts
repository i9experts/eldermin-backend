import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './decorators';
import { UserRole } from './roles.enum';

/**
 * Partner (reseller) accounts are platform-level: their token carries no school, and the Reseller Portal is the only thing they use
 * (it is scoped to their own resellerId by resolveResellerScope). Everywhere else a school-less token used to be able to name a school
 * through the x-school-slug header and read it. This guard refuses both reseller roles on every route except the allowlist below.
 *
 * Allowlist, built from the calls the web Reseller Portal actually makes (Eldermin-Frontend src/services/reseller-portal.api.ts and
 * resellerPortalAuth.ts) plus the shared auth routes a login session needs:
 *   any method  /api/v1/reseller-portal and /api/v1/reseller-portal/**
 *   POST        /api/v1/auth/login, /auth/logout, /auth/logout-all, /auth/forgot-password, /auth/reset-password
 *   GET         /api/v1/auth/me
 * (login, logout, forgot/reset are @Public and never reach this guard; they are listed so the table is the whole story.)
 *
 * Kill switch: RESELLER_SCOPE_GUARD=off restores the old behaviour. Anything else (unset, "enforce", a typo) enforces.
 * super_admin and every other role pass through untouched.
 */
const RESELLER_ROLES: string[] = [UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT];
const API_PREFIX = '/api/v1';
const PORTAL_PREFIX = `${API_PREFIX}/reseller-portal`;
const AUTH_ALLOWED: Array<[string, string]> = [
  ['POST', `${API_PREFIX}/auth/login`],
  ['POST', `${API_PREFIX}/auth/logout`],
  ['POST', `${API_PREFIX}/auth/logout-all`],
  ['POST', `${API_PREFIX}/auth/forgot-password`],
  ['POST', `${API_PREFIX}/auth/reset-password`],
  ['GET', `${API_PREFIX}/auth/me`],
];

export function resellerScopeMode(): 'enforce' | 'off' {
  return String(process.env.RESELLER_SCOPE_GUARD || '').trim().toLowerCase() === 'off' ? 'off' : 'enforce';
}

/** True when a reseller token may call this method + url. Anything odd in the path (encoding, dot segments, empty segments) is refused. */
export function isResellerAllowed(method: string, url: string): boolean {
  const raw = String(url || '').split('?')[0].split('#')[0];
  if (!raw.startsWith('/') || raw.includes('%') || raw.includes('..') || raw.includes('//') || raw.includes('\\')) return false;
  const path = (raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw).toLowerCase();
  if (path === PORTAL_PREFIX || path.startsWith(`${PORTAL_PREFIX}/`)) return true;
  const m = String(method || '').toUpperCase();
  return AUTH_ALLOWED.some(([am, ap]) => am === m && ap === path);
}

@Injectable()
export class ResellerScopeGuard implements CanActivate {
  private readonly logger = new Logger(ResellerScopeGuard.name);
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;

    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    // Registered after JwtAuthGuard (see AppModule), so an authenticated route always has a user here.
    if (!user) return true;
    const role = String(user.role || user.primaryRole || '');
    if (!RESELLER_ROLES.includes(role)) return true;
    if (resellerScopeMode() === 'off') return true;
    if (isResellerAllowed(req.method, req.originalUrl || req.url)) return true;

    this.logger.warn(`Reseller scope: denied ${req.method} ${String(req.originalUrl || req.url).split('?')[0]} for user ${user.userId || 'unknown'} (role ${role})`);
    throw new ForbiddenException('Access denied. Partner accounts can only use the Reseller Portal.');
  }
}
