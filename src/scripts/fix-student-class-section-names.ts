import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Grade, GradeDocument } from '../organization/schemas/organization.schema';

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

const normalize = (s: string) => String(s || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

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

    const gradeByNorm = new Map<string, string>(); // normalized grade name -> canonical name
    const sectionIndex = new Map<string, { gradeName: string; sectionName: string }>(); // normalized section name -> owning grade + canonical section name
    for (const g of grades) {
      gradeByNorm.set(normalize(g.name), g.name);
      for (const s of g.sections || []) {
        if ((s as any).isActive === false || !s.name) continue;
        sectionIndex.set(normalize(s.name), { gradeName: g.name, sectionName: s.name });
      }
    }

    const students = await studentModel.find({ schoolSlug }).select('_id currentGrade currentSection').lean();
    let fixed = 0;
    const unresolved: { id: string; currentGrade: string; currentSection: string }[] = [];

    for (const s of students) {
      const rawGrade = s.currentGrade || '';
      const rawSection = s.currentSection || '';
      let newGrade: string | undefined = gradeByNorm.get(normalize(rawGrade));
      let newSection: string | undefined;

      if (newGrade) {
        // Grade resolved normally — look up the canonical section name
        // under the same grade, if the student's section string matches.
        const grade = grades.find((g) => g.name === newGrade);
        const match = (grade?.sections || []).find((sec: any) => normalize(sec.name) === normalize(rawSection));
        newSection = match?.name;
      } else {
        // Grade field doesn't match any Grade.name — check whether it's
        // actually a full class label (grade+section mixed into the
        // grade field), by matching it against the Section master instead.
        const bySection = sectionIndex.get(normalize(rawGrade));
        if (bySection) {
          newGrade = bySection.gradeName;
          newSection = bySection.sectionName;
        }
      }

      if (!newSection) {
        // Still try resolving the section on its own even if the grade
        // didn't change, in case only the section string has drifted.
        const direct = sectionIndex.get(normalize(rawSection));
        if (direct && (!newGrade || direct.gradeName === newGrade)) {
          newGrade = newGrade || direct.gradeName;
          newSection = direct.sectionName;
        }
      }

      const gradeChanged = newGrade && newGrade !== rawGrade;
      const sectionChanged = newSection && newSection !== rawSection;

      if (gradeChanged || sectionChanged) {
        console.log(
          `Student ${s._id}: "${rawGrade}"/"${rawSection}" -> "${newGrade || rawGrade}"/"${newSection || rawSection}"`,
        );
        fixed++;
        if (apply) {
          const update: any = {};
          if (gradeChanged) update.currentGrade = newGrade;
          if (sectionChanged) update.currentSection = newSection;
          await studentModel.updateOne({ _id: s._id }, { $set: update });
        }
      } else if (!newGrade) {
        unresolved.push({ id: String(s._id), currentGrade: rawGrade, currentSection: rawSection });
      }
    }

    console.log(`\n${apply ? 'Applied' : 'Would apply'} ${fixed} fix(es) out of ${students.length} student(s) for school ${schoolSlug}.`);
    if (unresolved.length > 0) {
      console.log(`\n${unresolved.length} student(s) could not be matched to any master Grade/Section — needs manual review:`);
      for (const u of unresolved) console.log(`  ${u.id}: currentGrade="${u.currentGrade}" currentSection="${u.currentSection}"`);
    }
    if (!apply && fixed > 0) {
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
