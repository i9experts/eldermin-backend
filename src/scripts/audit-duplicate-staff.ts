import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileDocument } from '../modules/teaching/schemas/teacher-profile.schema';

// ============================================================
// AUDIT: duplicate Staff records (and their TeacherProfiles) for the same
// physical person. createStaff had no duplicate check at all - re-entering
// the same teacher a second time (e.g. during HR onboarding, then again
// later when giving them a second role/designation) silently created a
// second Staff document, which then got its own TeacherProfile - showing
// that person twice in the Teacher Directory, one row fully populated and
// one blank (no subjects/grades, since the stray record was never set up).
// Fixed going forward (email-based duplicate check in createStaff, name
// match guard in syncTeacherProfilesFromHR) - this script is read-only and
// only REPORTS existing duplicates for a human to review and merge/delete
// via the normal HR → Staff and Teaching → Teacher Directory "Delete"
// actions. It never deletes or merges anything itself: picking which
// record is canonical (which role, which subjects/grades, which login)
// needs a person's judgment, not a script's guess.
//
// Usage: npm run audit:duplicate-staff -- --tenantId=<id>
// (omit --tenantId to scan every tenant)
// ============================================================
function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
}

const normalizeName = (s: any) => `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');

async function run() {
  const tenantId = arg('tenantId');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const staffModel = app.get<Model<StaffDocument>>(getModelToken(Staff.name));
    const teacherProfileModel = app.get<Model<TeacherProfileDocument>>(getModelToken(TeacherProfile.name));

    const filter: any = {};
    if (tenantId) filter.tenantId = tenantId;
    const allStaff = await staffModel.find(filter).select('firstName lastName email employeeId tenantId campusId designation status').lean();

    const byTenantAndName = new Map<string, any[]>();
    for (const s of allStaff) {
      const key = `${s.tenantId}::${normalizeName(s)}`;
      if (!key.trim()) continue;
      if (!byTenantAndName.has(key)) byTenantAndName.set(key, []);
      byTenantAndName.get(key)!.push(s);
    }

    let groupsWithDuplicates = 0;
    for (const [key, group] of byTenantAndName) {
      if (group.length < 2) continue;
      groupsWithDuplicates++;
      const name = key.split('::')[1];
      console.log(`\n"${name}" - ${group.length} Staff records (tenant ${group[0].tenantId}):`);
      for (const s of group) {
        const profile = await teacherProfileModel.findOne({ staffId: s._id }).select('subjectsCanTeach gradeLevelsCanTeach').lean();
        const hasRealData = !!(profile?.subjectsCanTeach?.length || profile?.gradeLevelsCanTeach?.length);
        console.log(
          `  Staff ${s._id} | employeeId=${s.employeeId} | email=${s.email || '—'} | designation=${s.designation || '—'} | status=${s.status} | ` +
          `TeacherProfile=${profile ? (hasRealData ? 'has subjects/grades' : 'EMPTY (likely the stray one)') : 'none'}`,
        );
      }
    }

    console.log(`\n${groupsWithDuplicates} name(s) matched 2+ Staff records out of ${allStaff.length} Staff scanned${tenantId ? ` (tenant ${tenantId})` : ' (all tenants)'}.`);
    if (groupsWithDuplicates > 0) {
      console.log('Review each group above, then merge any real teaching data onto the record to keep, and delete the stray Staff/TeacherProfile via HR → Staff and Teaching → Teacher Directory.');
    }
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
