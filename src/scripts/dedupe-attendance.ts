import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';

// ============================================================
// DEDUPE STUDENT ATTENDANCE — one-time repair for leftover duplicate
// attendance documents from before the { studentId, date, subject }
// unique index replaced the old { studentId, date } one (see the
// DEPLOYMENT NOTE on that index in student-supporting.schema.ts — the old
// index had to be dropped manually and, on at least one school, wasn't).
// Any such duplicate made the Attendance Report double-count a single
// day (e.g. "Present: 2" for a one-day filter) because the report summed
// every matching document per student with no per-day dedup — that
// summing bug is fixed separately in getStudentAttendanceSummaryReport;
// this script cleans up the duplicate rows already sitting in the DB.
//
// For each (schoolSlug, studentId, calendar day, subject) group with more
// than one document, keeps the most recently updated one and removes the
// rest.
//
// Usage: npm run dedupe:attendance
//   -> dry run, logs every group that would change, nothing written
// Usage: npm run dedupe:attendance -- --apply
//   -> applies the fix
// ============================================================
async function run() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'Applying fix...' : 'Dry run (pass --apply to write changes)...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const attendanceModel = app.get(getModelToken('StudentAttendance'));

  const records = await attendanceModel
    .find({})
    .select('_id schoolSlug studentId date subject updatedAt createdAt')
    .lean();
  console.log(`Checked ${records.length} attendance record(s).`);

  const byKey = new Map<string, any[]>();
  for (const r of records as any[]) {
    const day = new Date(r.date).toISOString().slice(0, 10);
    const key = `${r.schoolSlug}|${r.studentId}|${day}|${r.subject || ''}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }

  let groupsChanged = 0;
  let recordsRemoved = 0;
  const idsToRemove: any[] = [];

  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    groupsChanged++;
    const sorted = [...group].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || b.date).getTime() - new Date(a.updatedAt || a.createdAt || a.date).getTime(),
    );
    const [winner, ...losers] = sorted;
    recordsRemoved += losers.length;
    idsToRemove.push(...losers.map((l) => l._id));
    console.log(`  ${key}: ${group.length} duplicates — keeping _id=${winner._id} (most recently updated), removing ${losers.length}`);
  }

  if (apply && idsToRemove.length) {
    await attendanceModel.deleteMany({ _id: { $in: idsToRemove } });
  }

  console.log(
    `\n${groupsChanged} group(s) ${apply ? 'had' : 'would have'} duplicates, ${recordsRemoved} record(s) ${apply ? 'removed' : 'would be removed'}, out of ${records.length} checked.`,
  );
  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
