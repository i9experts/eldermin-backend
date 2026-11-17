// ============================================================
// MIGRATION: student_attendance unique index {studentId,date} -> {studentId,date,subject}
// ============================================================
// Needed for subject-wise attendance (one record per student, day AND subject). The app works BEFORE and AFTER this runs:
// before, a daily school is unaffected and a second subject on one day answers a clear 409; after, subject-wise saves work.
// DRY RUN by default (reads only, prints counts/ids, never names):
//   npm run build && node dist/scripts/migrate-student-attendance-index.js --uri=<mongodb uri>     (or set MONGODB_URI)
// APPLY (owner, production, after the dry run; take a snapshot first):
//   node dist/scripts/migrate-student-attendance-index.js --uri=<uri> --apply --confirm-db=<actual database name>
// Safety: prints host + database; --apply is refused unless --confirm-db equals the ACTUAL connected database name; creates the new
// unique index FIRST, drops the old one only afterwards; idempotent (a second run says "Nothing to do"); never deletes or edits a
// document. Exit codes: 0 ok, 3 refused (confirm-db), 4 blocking duplicates.
// ============================================================
import * as mongoose from 'mongoose';
import { COLLECTION, runMigration } from './student-attendance-index.core';

function parse(argv: string[], env: NodeJS.ProcessEnv) {
  const get = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  return { uri: get('uri') || env.MONGODB_URI, apply: argv.includes('--apply'), confirmDb: get('confirm-db') };
}

async function main() {
  const args = parse(process.argv.slice(2), process.env);
  if (!args.uri) { console.error('No database: pass --uri=<mongodb uri> or set MONGODB_URI.'); process.exit(2); }
  const conn = await mongoose.createConnection(args.uri).asPromise();
  try {
    const db: any = conn.db;
    const target = { host: `${conn.host}:${conn.port}`, db: db.databaseName as string };
    const col: any = db.collection(COLLECTION);
    const res = await runMigration({
      apply: args.apply, confirmDb: args.confirmDb, target, log: (s) => console.log(s),
      coll: {
        indexes: () => col.indexes().catch((e: any) => (e?.codeName === 'NamespaceNotFound' ? [] : Promise.reject(e))),
        createIndex: (k, o) => col.createIndex(k, o),
        dropIndex: (n) => col.dropIndex(n),
        aggregate: (p) => col.aggregate(p),
        countDocuments: (f) => col.countDocuments(f || {}),
      },
    });
    process.exitCode = res.exitCode;
  } finally {
    await conn.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
