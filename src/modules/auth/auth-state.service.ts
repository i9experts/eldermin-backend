import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../organization/schemas/user.schema';

/**
 * Per-request account state check for the JWT strategy (S3).
 *
 * A token is accepted only while its user (a) exists, (b) is active and (c) still has the
 * token's version: `payload.tv` (absent = 0) must equal User.tokenVersion (absent = 0).
 * Existing tokens without `tv` therefore keep working until the first bump.
 *
 * Cost: one indexed `_id` read with a 2-field projection (lean), cached IN PROCESS per user for
 * at most CACHE_TTL_MS (30 s hard cap; bounded to MAX_ENTRIES). No Redis.
 *  - A bump or deactivation made on THIS instance invalidates its cache immediately.
 *  - With several instances (pm2 cluster) another instance learns about it only when its own
 *    cache entry expires: worst-case staleness = the TTL (<= 30 s). Nothing else lags.
 * Infrastructure failure (DB error) -> 503, never fail-open. Missing / inactive / wrong version
 * -> 401. Kill switch: AUTH_STATE_CHECK=off skips the check entirely (default: on).
 */
const CACHE_TTL_MS_CAP = 30_000;
const MAX_ENTRIES = 5_000;

export function authStateCheckEnabled(): boolean {
  return String(process.env.AUTH_STATE_CHECK || '').trim().toLowerCase() !== 'off';
}
export function cacheTtlMs(): number {
  const v = Number(process.env.AUTH_STATE_CACHE_TTL_MS);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, CACHE_TTL_MS_CAP) : CACHE_TTL_MS_CAP;
}

interface Entry { isActive: boolean; tv: number; expires: number }

@Injectable()
export class AuthStateService {
  private readonly logger = new Logger('AuthState');
  private cache = new Map<string, Entry>();
  private stats = { hits: 0, misses: 0, rejected: 0, errors: 0 };
  private timer?: NodeJS.Timeout;

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {
    // counters go to the log only (no public endpoint); default every 60 s, only when there was activity
    const every = Number(process.env.AUTH_STATE_STATS_INTERVAL_MS) || 60_000;
    this.timer = setInterval(() => this.logStats(), every);
    this.timer.unref?.();
  }

  getStats() { return { ...this.stats, cacheSize: this.cache.size }; }

  private logStats() {
    const s = this.stats;
    if (!(s.hits || s.misses || s.rejected || s.errors)) return;
    this.logger.log(JSON.stringify({ event: 'auth_state_stats', ...s, cacheSize: this.cache.size, hitRate: Number((s.hits / Math.max(1, s.hits + s.misses)).toFixed(4)) }));
    this.stats = { hits: 0, misses: 0, rejected: 0, errors: 0 };
  }

  /** Drop the cached state of one user (called right after a bump / deactivation on this instance). */
  invalidate(userId: any) { this.cache.delete(String(userId)); }
  clear() { this.cache.clear(); }

  /** Throws 401 / 503 when the token must not be accepted. Returns void when it may proceed. */
  async assertTokenValid(payload: { sub?: string; tv?: any }): Promise<void> {
    if (!authStateCheckEnabled()) return;
    const sub = String(payload?.sub ?? '');
    if (!Types.ObjectId.isValid(sub)) throw new UnauthorizedException('Your session is no longer valid. Please sign in again.');
    const tokenTv = Number.isInteger(payload.tv) ? (payload.tv as number) : 0;

    const now = Date.now();
    let entry = this.cache.get(sub);
    let fromCache = false;
    if (entry && entry.expires > now) { this.stats.hits++; fromCache = true; }
    else { this.stats.misses++; entry = await this.load(sub, now); }

    // A cached entry that would REJECT the token may simply be stale (e.g. the account was bumped by
    // another instance and the user has just signed in again: the new token is NEWER than the cache).
    // Rejections are therefore always confirmed against the database before they are returned; only
    // acceptance can lag (by <= TTL), never a wrongful rejection of a fresh session.
    if (fromCache && (!entry!.isActive || entry!.tv !== tokenTv)) {
      this.stats.misses++;
      entry = await this.load(sub, now);
    }
    if (!entry!.isActive) { this.stats.rejected++; throw new UnauthorizedException('This account is no longer active.'); }
    if (entry!.tv !== tokenTv) { this.stats.rejected++; throw new UnauthorizedException('Your session has ended. Please sign in again.'); }
  }

  private async load(sub: string, now: number): Promise<Entry> {
    let doc: any;
    try {
      doc = await this.userModel.findOne({ _id: sub }).select('isActive tokenVersion').lean();
    } catch (err) {
      this.stats.errors++;
      this.logger.error(`Account state lookup failed (503, not failing open): ${(err as Error)?.message}`);
      throw new ServiceUnavailableException('Service temporarily unavailable. Please try again.');
    }
    if (!doc) { this.cache.delete(sub); this.stats.rejected++; throw new UnauthorizedException('Your session is no longer valid. Please sign in again.'); }
    const entry: Entry = { isActive: doc.isActive !== false, tv: Number.isInteger(doc.tokenVersion) ? doc.tokenVersion : 0, expires: now + cacheTtlMs() };
    if (cacheTtlMs() > 0) {
      if (this.cache.size >= MAX_ENTRIES) this.evict(now);
      this.cache.set(sub, entry);
    }
    return entry;
  }

  private evict(now: number) {
    for (const [k, v] of this.cache) if (v.expires <= now) this.cache.delete(k);
    if (this.cache.size >= MAX_ENTRIES) {
      // still full: drop the oldest ~10% (Map keeps insertion order)
      let n = Math.ceil(MAX_ENTRIES / 10);
      for (const k of this.cache.keys()) { this.cache.delete(k); if (--n <= 0) break; }
    }
  }
}
