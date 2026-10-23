import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';

// ============================================================
// DEDUPE GRADE SECTIONS — one-time repair for sections repeating in the
// Section dropdown. Grade.addSection used to $push a new Section
// subdocument with no check for an existing one of the same name, so
// re-adding (or double-submitting) a section like "A" created a second
// subdocument with the same name but a different _id — every
// SectionDropdown in the app then showed "A" twice. The going-forward
// fix is in OrganizationService.addSection itself (rejects a duplicate
// name); this repairs Grade documents that already have duplicate
// Section subdocuments.
//
// For each duplicate name within a Grade, keeps ONE subdocument:
// prefers one with a classTeacherId set (so an existing class-teacher
// assignment is never lost), otherwise the earliest-created one
// (smallest ObjectId). All other duplicates for that name are removed.
//
// Usage: npm run dedupe:grade-sections
//   -> dry run, logs every grade/section that would change, nothing written
// Usage: npm run dedupe:grade-sections -- --apply
//   -> applies the fix
// ============================================================
async function run() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'Applying fix...' : 'Dry run (pass --apply to write changes)...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const gradeModel = app.get(getModelToken('Grade'));

  const grades = await gradeModel.find({}).select('_id name schoolSlug sections').lean();
  console.log(`Checked ${grades.length} grade(s).`);

  let gradesChanged = 0;
  let sectionsRemoved = 0;

  for (const grade of grades as any[]) {
    const sections: any[] = grade.sections || [];
    if (sections.length < 2) continue;

    const byName = new Map<string, any[]>();
    for (const s of sections) {
      const key = String(s.name || '').trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(s);
    }

    const toKeep: any[] = [];
    let changedHere = false;

    for (const [, group] of byName) {
      if (group.length === 1) {
        toKeep.push(group[0]);
        continue;
      }
      changedHere = true;
      const withTeacher = group.find((s) => s.classTeacherId);
      const sorted = [...group].sort((a, b) => String(a._id).localeCompare(String(b._id)));
      const winner = withTeacher || sorted[0];
      toKeep.push(winner);
      sectionsRemoved += group.length - 1;
      console.log(
        `  ${grade.name} (${grade.schoolSlug}): "${winner.name}" has ${group.length} duplicates — keeping _id=${winner._id}${withTeacher ? ' (has class teacher)' : ''}, removing ${group.length - 1}`,
      );
    }

    if (changedHere) {
      gradesChanged++;
      if (apply) {
        await gradeModel.updateOne({ _id: grade._id }, { $set: { sections: toKeep } });
      }
    }
  }

  console.log(
    `\n${gradesChanged} grade(s) ${apply ? 'updated' : 'would be updated'}, ${sectionsRemoved} duplicate section(s) ${apply ? 'removed' : 'would be removed'}, out of ${grades.length} checked.`,
  );
  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
