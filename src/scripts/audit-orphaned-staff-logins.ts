// ============================================================
// AUDIT / CLEANUP: staff logins that outlived their staff record (S1)
// ============================================================
// DRY RUN by default: prints counts and ids only (no names/e-mails/phones).
//   npm run build && node dist/scripts/audit-orphaned-staff-logins.js --uri=<mongodb uri>
//   (or set MONGODB_URI)
// APPLY (owner, on production, after reviewing the dry run):
//   node dist/scripts/audit-orphaned-staff-logins.js --uri=<uri> --apply --confirm-db=<actual database name> [--backup-dir=./backups]
// Safety: prints the target host + database; --apply is refused unless
// --confirm-db equals the actual database name; a JSON backup of every document
// it will change is written AND verified (sha256 + re-read) before the first
// update; the changes go through AccountAccessService (same logic as the live
// removal paths); idempotent (already-handled accounts are not candidates).
// Shared staff+guardian accounts are DEMOTED to parent, never deactivated.
// Boots only Mongoose + AccountAccessModule (NO cron jobs run).
// ============================================================
import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }
import * as fs from 'fs';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MongooseModule, getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { AccountAccessModule } from '../modules/auth/account-access.module';
import { AccountAccessService } from '../modules/auth/account-access.service';
import { parseArgs, runOrphanCleanup } from './orphaned-staff-logins.core';

function describeUri(uri: string) {
  // host + db name only; never prints credentials
  const m = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/?([^?]*)/);
  return { host: m?.[1] ?? 'unknown', db: m?.[2] ?? '' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), process.env);
  if (!args.uri) { console.error('No database: pass --uri=<mongodb uri> or set MONGODB_URI.'); process.exit(2); }
  const target = describeUri(args.uri);
  if (!target.db) { console.error('The URI must name the database (mongodb://host/<dbname>).'); process.exit(2); }

  @Module({
    imports: [
      MongooseModule.forRoot(args.uri),
      MongooseModule.forFeature([{ name: Staff.name, schema: StaffSchema }, { name: User.name, schema: UserSchema }]),
      AccountAccessModule,
    ],
  })
  class ScriptModule {}

  const app = await NestFactory.createApplicationContext(ScriptModule, { logger: ['error', 'warn'] });
  try {
    const staffModel = app.get(getModelToken(Staff.name));
    const userModel = app.get(getModelToken(User.name));
    const svc = app.get(AccountAccessService);
    // The ACTUAL connected database (not just what the URI says) is what --confirm-db is compared with.
    const conn: any = app.get(getConnectionToken());
    const actual = { host: `${conn.host}:${conn.port}`, db: conn.db.databaseName as string };
    const res = await runOrphanCleanup({
      apply: args.apply, confirmDb: args.confirmDb, target: actual, backupDir: args.backupDir, now: new Date(), fs: fs as any,
      log: (s) => console.log(s), staffModel, userModel,
      deactivate: (userId, reason, actorId, actor) => svc.deactivateStaffLogin(userId, reason, actorId, actor),
    });
    if (res.refused) process.exitCode = 3;
  } finally {
    await app.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
