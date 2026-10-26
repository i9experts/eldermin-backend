import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { OrganizationService } from '../organization/organization.service';

// ============================================================
// REPAIR: teacher class-teacher assignments for a school — one-time fix
// for teachers whose TeacherProfile was corrupted by the old
// assignClassTeacher bug (assigning a teacher as class teacher of a SECOND
// section used to silently overwrite the first section in their profile,
// so only one of their real sections' students ever showed up for
// attendance/assessments/portals - see classTeacherAssignments comment in
// teacher-profile.schema.ts for the full history).
//
// This calls the same OrganizationService.recomputeAllClassTeacherAssignments
// that assignClassTeacher itself now calls on every future assignment
// change, so it's the exact self-healing logic, just run proactively for
// every teacher in a school right now instead of waiting for their next
// assignment change. Rebuilds classTeacherAssignments (and the mirrored
// singular fields) for every teacher from the Grade/Section records
// themselves - the real source of truth - so it is safe to re-run anytime.
//
// Usage: npm run fix:class-teacher-assignments -- --schoolSlug=<slug>
// ============================================================
function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
}

async function run() {
  const schoolSlug = arg('schoolSlug');
  if (!schoolSlug || schoolSlug === 'true') {
    console.log('Usage: npm run fix:class-teacher-assignments -- --schoolSlug=<slug>');
    process.exit(0);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const service = app.get(OrganizationService);
    const result = await service.recomputeAllClassTeacherAssignments(schoolSlug);
    console.log(`School ${schoolSlug}: recomputed class-teacher assignments for ${result.teachersProcessed} teacher(s).`);
    for (const r of result.results) {
      console.log(`  userId ${r.userId}: ${r.sections} section-assignment(s) found`);
    }
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
