import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Grade, GradeDocument } from '../organization/schemas/organization.schema';
import { computeClassSectionRepair } from '../common/utils/class-section-repair.util';

// ============================================================
// REPAIR: Student.currentGrade/currentSection drift from the Institution
// Setup Grade/Section master — these are free-text fields with no FK, so
// typos/casing variants ("Grade-1" vs "GRADE-1", "Prek-2" vs "PREK-2") and
// grade+section mix-ups (a full class label like "KG-B"/"Grade-1B" typed
// into the grade field, usually via CSV import) accumulate over time and
// leak straight into the Student Directory's Class/Section filters, which
// now read the master list directly (see getDistinctGradesSections in
// students.service.ts) and so no longer show these stray values as options
// — any student still carrying one becomes invisible to that filter.
//
// This repairs existing data to match the master canonically:
//   1. Normalized (case/space/hyphen-insensitive) match against a real
//      Grade.name -> rewrite currentGrade to the canonical name.
//   2. If currentGrade doesn't match any Grade but matches a Section.name
//      somewhere in the school (the "section typed into the grade field"
//      mistake) -> resolve the real grade+section pair from that.
//   3. Normalized match of currentSection against the resolved grade's
//      real Section.name list -> rewrite to canonical name.
// Students that still don't resolve after this (truly unknown values) are
// left untouched and listed for manual review.
//
// Usage: npm run fix:student-class-section-names -- --schoolSlug=<slug> [--apply]
// Without --apply, runs as a dry run and only prints what would change.
// ============================================================
function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
}

async function run() {
  const schoolSlug = arg('schoolSlug');
  const apply = arg('apply') === 'true';
  if (!schoolSlug || schoolSlug === 'true') {
    console.log('Usage: npm run fix:student-class-section-names -- --schoolSlug=<slug> [--apply]');
    process.exit(0);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const studentModel = app.get<Model<StudentDocument>>(getModelToken(Student.name));
    const gradeModel = app.get<Model<GradeDocument>>(getModelToken(Grade.name));

    const grades = await gradeModel.find({ schoolSlug, isActive: true }).lean();
    if (grades.length === 0) {
      console.log(`No Grade master records found for school ${schoolSlug} — nothing to repair against.`);
      return;
    }

    const students = await studentModel.find({ schoolSlug }).select('_id firstName lastName currentGrade currentSection').lean();
    const { fixes, unresolved } = computeClassSectionRepair(
      grades.map((g: any) => ({ name: g.name, sections: g.sections })),
      students.map((s: any) => ({ id: String(s._id), name: `${s.firstName || ''} ${s.lastName || ''}`.trim(), currentGrade: s.currentGrade, currentSection: s.currentSection })),
    );

    for (const f of fixes) {
      console.log(`Student ${f.studentId}: "${f.oldGrade}"/"${f.oldSection}" -> "${f.newGrade || f.oldGrade}"/"${f.newSection || f.oldSection}"`);
      if (apply) {
        const update: any = {};
        if (f.newGrade) update.currentGrade = f.newGrade;
        if (f.newSection) update.currentSection = f.newSection;
        await studentModel.updateOne({ _id: f.studentId }, { $set: update });
      }
    }

    console.log(`\n${apply ? 'Applied' : 'Would apply'} ${fixes.length} fix(es) out of ${students.length} student(s) for school ${schoolSlug}.`);
    if (unresolved.length > 0) {
      console.log(`\n${unresolved.length} student(s) could not be matched to any master Grade/Section — needs manual review:`);
      for (const u of unresolved) console.log(`  ${u.studentId}: currentGrade="${u.currentGrade}" currentSection="${u.currentSection}"`);
    }
    if (!apply && fixes.length > 0) {
      console.log('\nThis was a dry run — re-run with --apply to write these changes.');
    }
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
