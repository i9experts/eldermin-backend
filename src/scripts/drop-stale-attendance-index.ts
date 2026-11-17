import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';

// ============================================================
// DROP STALE ATTENDANCE INDEX — the actual, confirmed root cause of the
// recurring "Someone else just saved attendance..." 409 on bulk attendance
// save.
//
// student-supporting.schema.ts replaced the StudentAttendance collection's
// unique index from { studentId, date } to { studentId, date, subject }
// months ago, but Mongoose never drops a replaced index on its own — the
// schema file's own DEPLOYMENT NOTE warned that the old index had to be
// dropped manually in production, and on this school's database it never
// was. Both indexes have been coexisting live:
//   - studentId_1_date_1              (old, stale)
//   - studentId_1_date_1_subject_1    (current, correct)
//
// Because the old index only looks at (studentId, date) with no subject
// discrimination, any upsert that doesn't find a matching record under the
// NEW index (e.g. a different subject's record already exists for that
// same studentId+date) falls through to an INSERT, which the OLD index
// then rejects outright — a deterministic collision that reproduces on
// every retry, confirmed directly from a production log showing:
//   E11000 ... index: studentId_1_date_1 dup key: { studentId: ..., date: ... }
//
// This is a database schema issue, not something any application-level
// query/filter change can fix. This script drops the stale index only; it
// does not touch or need to touch any documents (dedupe-attendance.ts
// handles any leftover duplicate documents separately, if needed).
//
// Usage: npm run fix:drop-stale-attendance-index
//   -> dry run, reports whether the stale index exists, nothing changed
// Usage: npm run fix:drop-stale-attendance-index -- --apply
//   -> drops the stale index if present
// ============================================================

const STALE_INDEX_NAME = 'studentId_1_date_1';

async function run() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'Applying fix...' : 'Dry run (pass --apply to write changes)...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const attendanceModel = app.get(getModelToken('StudentAttendance'));

  const indexes = await attendanceModel.collection.indexes();
  console.log('Current indexes on student_attendance:');
  for (const idx of indexes) {
    console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}${idx.unique ? ' (unique)' : ''}`);
  }

  const stale = indexes.find((idx: any) => idx.name === STALE_INDEX_NAME);
  if (!stale) {
    console.log(`\nStale index "${STALE_INDEX_NAME}" not found — nothing to do.`);
    await app.close();
    return;
  }

  console.log(`\nFound stale index "${STALE_INDEX_NAME}": ${JSON.stringify(stale.key)}`);
  if (apply) {
    await attendanceModel.collection.dropIndex(STALE_INDEX_NAME);
    console.log(`Dropped index "${STALE_INDEX_NAME}".`);
  } else {
    console.log('Would drop this index (pass --apply to actually drop it).');
  }

  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
