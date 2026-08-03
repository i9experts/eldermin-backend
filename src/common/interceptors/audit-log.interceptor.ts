import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLog, AuditLogDocument } from '../../compliance/schemas/compliance.schema';

// Routes that should never generate an audit entry for themselves - avoids
// recursive noise (logging the act of reading/writing logs) and excludes
// pure health/auth-plumbing routes that aren't a real "record" being acted on.
const EXCLUDED_PATH_FRAGMENTS = ['/compliance/audit-logs', '/health', '/auth/refresh'];
const AUTH_EVENT_PATHS = ['/auth/login', '/auth/logout'];

const METHOD_TO_TYPE: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

const METHOD_TO_VERB: Record<string, string> = {
  POST: 'Created',
  PUT: 'Updated',
  PATCH: 'Updated',
  DELETE: 'Deleted',
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;
    const path: string = req.originalUrl || req.url || '';

    const isAuthEvent = AUTH_EVENT_PATHS.some((f) => path.includes(f));
    const shouldLog =
      (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || isAuthEvent) &&
      !EXCLUDED_PATH_FRAGMENTS.some((f) => path.includes(f));

    if (!shouldLog) return next.handle();

    return next.handle().pipe(
      tap((response) => {
        // Fire-and-forget - an audit log write must never be able to affect
        // the actual response the user already successfully received (the
        // same lesson learned the hard way with PDF generation's audit
        // trail throwing an uncaught error after the real work succeeded).
        const writer = isAuthEvent
          ? this.writeAuthEvent(req, path, response)
          : this.writeEntry(req, method, path, response);
        writer.catch((err) => {
          this.logger.warn(`Failed to write audit log entry (non-fatal): ${err.message}`);
        });
      }),
    );
  }

  // Login/logout don't go through JwtAuthGuard the normal way (login IS how
  // the token gets issued in the first place, so req.user doesn't exist yet
  // during the request itself) - the school/user identity has to be read
  // from the response body instead.
  private async writeAuthEvent(req: any, path: string, response: any) {
    const schoolSlug = response?.institution?.slug;
    if (!schoolSlug) return; // logout returns no body to identify the school from; nothing reliable to log against
    const ipAddress =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      undefined;
    await this.auditModel.create({
      schoolSlug,
      action: path.includes('/login') ? `Login: ${response?.user?.name || response?.user?.email || 'Unknown'}` : 'Logout',
      module: 'Auth',
      performedBy: response?.user?.name || response?.user?.email || 'Unknown',
      performedById: response?.user?.id,
      ipAddress,
      userAgent: req.headers?.['user-agent'],
      type: path.includes('/login') ? 'login' : 'logout',
    });
  }

  private async writeEntry(req: any, method: string, path: string, response: any) {
    const schoolSlug = req.user?.schoolSlug || req.headers?.['x-school-slug'];
    if (!schoolSlug) return; // platform-level (Super Admin) actions aren't school-scoped; skip rather than fake a value

    const performedBy = req.user?.name || req.user?.userId || 'Unknown';
    const performedById = req.user?.userId;
    const ipAddress =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      undefined;
    const userAgent = req.headers?.['user-agent'];

    const module = this.deriveModule(path);
    const resourceId = req.params?.id || response?._id || response?.id;
    const resourceTitle = this.deriveResourceTitle(req.body, response);
    const type = METHOD_TO_TYPE[method] || 'other';
    const action = `${METHOD_TO_VERB[method] || 'Modified'} ${module}${resourceTitle ? `: ${resourceTitle}` : ''}`;

    await this.auditModel.create({
      schoolSlug,
      action,
      module,
      resourceId,
      resourceTitle,
      performedBy,
      performedById,
      ipAddress,
      userAgent,
      type,
    });
  }

  // Derives a human-readable module name from the request path, e.g.
  // /api/v1/students/123 -> "Students", /api/v1/finance/invoices -> "Finance"
  private deriveModule(path: string): string {
    const cleaned = path.split('?')[0].replace(/^\/api\/v1\//, '');
    const segment = cleaned.split('/')[0] || 'System';
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  }

  // Best-effort human-readable label for what was acted on - checks common
  // field names across the app's various record types rather than assuming
  // one schema's shape.
  private deriveResourceTitle(body: any, response: any): string | undefined {
    const source = response || body;
    if (!source || typeof source !== 'object') return undefined;
    return (
      source.name ||
      source.title ||
      source.studentName ||
      source.invoiceNumber ||
      source.fullName ||
      (source.firstName ? `${source.firstName} ${source.lastName || ''}`.trim() : undefined) ||
      undefined
    );
  }
}
