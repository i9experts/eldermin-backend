// ============================================================
// AUDIT: campus/department scope readiness
// ============================================================
// Run before relying on the campus/department RBAC enforcement added
// across the app - lists exactly which real, login-capable accounts
// would get 403'd under the new hard-block model, and why, so gaps can
// be fixed deliberately instead of discovered via a support ticket.
//
// Run with: npm run audit:campus-scope
// (equivalent to: npx ts-node -r tsconfig-paths/register src/scripts/audit-campus-scope-readiness.ts)
// ============================================================

import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';

const SCOPED_ROLES_NEEDING_CAMPUS = [
  'principal', 'vice_principal', 'admin', 'academic_coordinator',
  'finance_manager', 'hr_manager', 'teacher', 'librarian', 'support_staff',
];
const EXEMPT_ROLES = ['super_admin', 'institution_owner'];

async function audit() {
  console.log('Auditing campus/department scope readiness...\n');
  const app = await NestFactory.createApplicationContext(AppModule);

  const userModel = app.get(getModelToken('User'));
  const staffModel = app.get(getModelToken('Staff'));
  const campusModel = app.get(getModelToken('Campus'));
  const tenantModel = app.get(getModelToken('Tenant'));

  const tenants = await tenantModel.find({}).select('slug displayName').lean();
  let totalFlagged = 0;

  for (const tenant of tenants) {
    const schoolSlug = tenant.slug;
    const campuses = await campusModel.find({ schoolSlug, isActive: true }).select('_id name').lean();

    // Every active, login-capable user for this school, with their role.
    // User is scoped by tenantId (a real Tenant._id ObjectId), not by
    // schoolSlug - that's a separate scoping convention used by
    // Campus/Grade/Department/etc. Joining Staff via userId below
    // sidesteps that inconsistency entirely, since it's a direct
    // reference rather than a tenant-scoped filter.
    const users = await userModel.find({ tenantId: tenant._id, isActive: true })
      .select('_id email name primaryRole role').lean();

    if (users.length === 0) continue;

    const flaggedForThisSchool: string[] = [];

    for (const user of users) {
      const role = user.primaryRole || user.role;
      if (EXEMPT_ROLES.includes(role)) continue;
      if (!SCOPED_ROLES_NEEDING_CAMPUS.includes(role)) continue;

      const staffRecord = await staffModel.findOne({ userId: user._id })
        .select('campusId department').lean();

      const hasCampus = !!staffRecord?.campusId;
      const hasDepartment = !!staffRecord?.department;

      // Mirrors the auto-heal logic in auth.service.ts: a single-campus
      // school resolves campusId automatically at login even if the
      // Staff record doesn't have it set, so that case is NOT a problem.
      const wouldAutoResolveCampus = !hasCampus && campuses.length === 1;

      const problems: string[] = [];
      if (!hasCampus && !wouldAutoResolveCampus) {
        problems.push(campuses.length === 0
          ? 'no campus assigned AND school has no campuses at all'
          : `no campus assigned (school has ${campuses.length} campuses - can't auto-resolve)`);
      }
      if (role === 'teacher' && !hasDepartment) {
        problems.push('no department assigned (required for teacher role)');
      }
      if (!staffRecord) {
        problems.push('no linked Staff record at all - login was never provisioned through HR');
      }

      if (problems.length > 0) {
        flaggedForThisSchool.push(`  - ${user.email} (${role}): ${problems.join('; ')}`);
        totalFlagged++;
      }
    }

    if (flaggedForThisSchool.length > 0) {
      console.log(`${tenant.displayName || schoolSlug} [${schoolSlug}] - ${campuses.length} campus(es): ${campuses.map((c: any) => c.name).join(', ') || '(none)'}`);
      flaggedForThisSchool.forEach((line) => console.log(line));
      console.log('');
    }
  }

  if (totalFlagged === 0) {
    console.log('No issues found - every scoped account has what it needs.');
  } else {
    console.log(`\n${totalFlagged} account(s) flagged. These will get 403'd on scoped endpoints until fixed:`);
    console.log('  - Assign campusId (and department, for teachers) on their Staff record, OR');
    console.log('  - Change their role if it was set incorrectly.');
  }

  await app.close();
  process.exit(0);
}

audit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
