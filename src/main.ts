// Deploy cache-buster: forcing a fresh Railway build after a stale
// snapshot cache caused every build since [commit 19312a4] to silently
// reuse old source, meaning the Enrollment Wizard fix, Institution<->
// Campus fix, and Guardian Directory fix never actually reached
// production despite being correctly pushed. No functional change.
import * as dotenv from 'dotenv';
dotenv.config();

import { initSentry } from './instrument';
initSentry();

import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from './filters/sentry.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Express auto-generates ETags for every response by default, which lets
  // browsers send conditional GETs (If-None-Match) and get back a 304 with
  // no body at all — silently reusing whatever was cached from a PREVIOUS
  // request instead of fetching fresh data. Confirmed this happening for
  // real: a staff list request came back 304 after new staff/logins were
  // added, and the browser kept showing the old cached list with no error
  // at all. API responses here are all dynamic and tenant-scoped — none of
  // them should ever be served from a stale browser cache.
  app.getHttpAdapter().getInstance().set('etag', false);

  // Express 5's default 'query parser' is 'simple' (Node's built-in
  // querystring module), which has NO idea about bracket array syntax -
  // `grade[]=Grade-1&grade[]=Grade-2` parses into a literal key named
  // "grade[]", leaving `grade` itself undefined. Axios's default array
  // serialization (used by every array-valued filter param across the
  // frontend, e.g. the Students list's Class/Section multi-select) sends
  // exactly that bracket syntax. The practical effect: any multi-select
  // filter silently had zero effect on the query - the endpoint received
  // no `grade`/`section` value at all and returned its unfiltered list,
  // while the UI still showed the filter chip as "selected". Switching to
  // 'extended' (the qs library) fixes this globally in one place, since
  // qs understands both bracket (`grade[]=`) and repeated-key
  // (`grade=A&grade=B`) array styles - rather than hunting down and
  // patching a custom paramsSerializer in each of the ~19 separate axios
  // instances across the frontend.
  app.getHttpAdapter().getInstance().set('query parser', 'extended');

  app.use((req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.enableCors({
    origin: [
      'https://eldermin.com',
      'https://www.eldermin.com',
      'https://app.eldermin.com',
      'https://api.eldermin.com',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-school-slug', 'x-academic-year'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new SentryExceptionFilter());

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Eldermin backend running on port ${port}`);
  // Never log the raw connection string - it embeds the DB username and
  // password in plaintext and would otherwise land in Railway's log
  // history (and anywhere those logs get copy-pasted). Log only the host,
  // which is enough to confirm which cluster the app connected to.
  const mongoHost = (() => {
    try { return new URL(process.env.MONGODB_URI || '').host || 'unknown'; }
    catch { return 'unknown'; }
  })();
  console.log(`MongoDB host: ${mongoHost}`);
}
bootstrap();
