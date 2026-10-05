// ============================================================
// AUDIT (READ-ONLY): teacher class assignments vs student grade/section
// ============================================================
// Reports, for ONE school:
//  (a) active students whose (currentGrade, currentSection) matches no
//      teacher assignment (class teacher or currentAssignments),
//  (b) assignments matching zero students,
//  (c) the raw distinct grade/section strings on both sides.
// Uses only find()/countDocuments - never writes.
//
// Usage:
//   npm run audit:teacher-class-matching -- --schoolSlug=<slug> --yes [--json]
// Without --yes it prints usage and exits without touching the DB.
// ============================================================

import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { AppModule } from '../app.module';
import {
  AuditAssignment, AuditStudent, auditClassMatching,
} from '../staff-portal/class-match-audit.util';

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
}

function dbHost(): string {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eldermin';
  try { return new URL(uri).host || 'unknown'; } catch { return 'unparseable-uri'; }
}

function usage() {
  console.log('Usage: npm run audit:teacher-class-matching -- --schoolSlug=<slug> --yes [--json]');
  console.log('  --schoolSlug  required; the school to audit');
  console.log('  --yes         required; confirms you accept reading from the DB shown in the banner');
  console.log('  --json        print machine-readable JSON instead of the text report');
  console.log('This script is READ-ONLY (find/count only).');
}

function printMap(title: string, m: Record<string, number>) {
  const rows = Object.entries(m).sort((a, b) => b[1] - a[1]);
  console.log(`  ${title}: ${rows.map(([k, n]) => `${k} x${n}`).join(', ') || '(none)'}`);
}

async function run() {
  const schoolSlug = arg('schoolSlug');
  const yes = arg('yes') === 'true';
  const asJson = arg('json') === 'true';
  if (!schoolSlug || schoolSlug === 'true' || !yes) { usage(); process.exit(0); }

  console.error('==============================================================');
  console.error(` READ-ONLY audit | DB host: ${dbHost()} | school: ${schoolSlug}`);
  console.error('==============================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const tenantModel = app.get(getModelToken('Tenant'));
    const studentModel = app.get(getModelToken('Student'));
    const profileModel = app.get(getModelToken('TeacherProfile'));
    const staffModel = app.get(getModelToken('Staff'));

    const tenant: any = await tenantModel.findOne({ slug: schoolSlug }).select('_id slug').lean();
    if (!tenant) { console.error(`No tenant with slug "${schoolSlug}".`); process.exitCode = 1; return; }

    const rawStudents: any[] = await studentModel
      .find({ schoolSlug, status: 'active' }).select('_id firstName lastName currentGrade currentSection').lean();
    const students: AuditStudent[] = rawStudents.map((s) => ({
      id: String(s._id), name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
      grade: s.currentGrade, section: s.currentSection,
    }));

    const profiles: any[] = await profileModel.find({ tenantId: tenant._id })
      .select('staffId isClassTeacher classTeacherOfGradeName classTeacherOfSectionName currentAssignments').lean();
    const staffRows: any[] = await staffModel
      .find({ _id: { $in: profiles.map((p) => p.staffId) } }).select('firstName lastName').lean();
    const staffName = new Map(staffRows.map((s) => [String(s._id), `${s.firstName || ''} ${s.lastName || ''}`.trim()]));

    const assignments: AuditAssignment[] = [];
    for (const p of profiles) {
      const base = { teacherId: String(p.staffId), teacherName: staffName.get(String(p.staffId)) };
      if (p.isClassTeacher && p.classTeacherOfGradeName) {
        assignments.push({ ...base, grade: p.classTeacherOfGradeName, section: p.classTeacherOfSectionName, source: 'classTeacher' });
      }
      for (const a of p.currentAssignments || []) {
        if (a?.gradeLevel) assignments.push({ ...base, grade: a.gradeLevel, section: a.sectionName, source: 'assignment' });
      }
    }

    const report = auditClassMatching(students, assignments);

    if (asJson) {
      console.log(JSON.stringify({ schoolSlug, ...report }, null, 2));
      return;
    }
    console.log(`School ${schoolSlug}: ${report.totals.students} active students, ${report.totals.assignments} teacher assignments\n`);
    console.log(`(a) Active students matching NO teacher assignment: ${report.unmatchedStudents.length}`);
    const byClass = new Map<string, number>();
    report.unmatchedStudents.forEach((s) => {
      const k = `${JSON.stringify(s.grade ?? '')} / ${JSON.stringify(s.section ?? '')}`;
      byClass.set(k, (byClass.get(k) || 0) + 1);
    });
    [...byClass].sort((x, y) => y[1] - x[1]).forEach(([k, n]) => console.log(`  ${k}: ${n} student(s)`));
    console.log(`\n(b) Assignments matching ZERO students: ${report.unmatchedAssignments.length}`);
    report.unmatchedAssignments.forEach((a) =>
      console.log(`  ${a.teacherName || a.teacherId} [${a.source}] ${JSON.stringify(a.grade ?? '')} / ${JSON.stringify(a.section ?? '')}`));
    console.log('\n(c) Raw strings seen (JSON-quoted so whitespace is visible)');
    printMap('student grades   ', report.studentRaw.grades);
    printMap('assignment grades', report.assignmentRaw.grades);
    printMap('student sections ', report.studentRaw.sections);
    printMap('assignment sects ', report.assignmentRaw.sections);
  } finally {
    await app.close();
  }
}

run().then(() => process.exit(process.exitCode || 0)).catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
