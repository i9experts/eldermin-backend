import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { buildClassTeacherOfName } from '../organization/utils/class-teacher-label.util';

// ============================================================
// FIX DUPLICATE CLASS TEACHER NAMES — one-time repair for the
// "Grade-2 - Grade 2B" / "KG - KG-B" style redundant labels reported in
// production. OrganizationService.assignClassTeacher used to always
// concatenate `${grade.name} - ${sectionName}`, which duplicated the
// grade name for any school whose "Section Name" field was typed as the
// full class name (e.g. "Grade 2B") rather than a bare letter (e.g. "B").
// The going-forward fix is in assignClassTeacher itself
// (buildClassTeacherOfName); this repairs TeacherProfile documents that
// already have the redundant label stored.
//
// Only recomputes the denormalized classTeacherOfName display field from
// each profile's own already-stored classTeacherOfGradeName /
// classTeacherOfSectionName - no other field, collection, or Grade/Section
// record is touched.
//
// Usage: npm run fix:class-teacher-names
//   -> dry run, logs every profile that would change, nothing written
// Usage: npm run fix:class-teacher-names -- --apply
//   -> applies the fix
// ============================================================
async function run() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'Applying fix...' : 'Dry run (pass --apply to write changes)...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const teacherProfileModel = app.get(getModelToken('TeacherProfile'));

  const profiles = await teacherProfileModel
    .find({ isClassTeacher: true, classTeacherOfGradeName: { $exists: true, $ne: null } })
    .select('_id firstName lastName classTeacherOfGradeName classTeacherOfSectionName classTeacherOfName')
    .lean();

  console.log(`Found ${profiles.length} class-teacher profile(s).`);

  let changed = 0;
  for (const p of profiles as any[]) {
    const correct = buildClassTeacherOfName(p.classTeacherOfGradeName, p.classTeacherOfSectionName);
    if (correct !== p.classTeacherOfName) {
      changed++;
      const label = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p._id;
      console.log(`  ${label}: "${p.classTeacherOfName}" -> "${correct}"`);
      if (apply) {
        await teacherProfileModel.updateOne({ _id: p._id }, { $set: { classTeacherOfName: correct } });
      }
    }
  }

  console.log(`\n${changed} profile(s) ${apply ? 'updated' : 'would be updated'} out of ${profiles.length} checked.`);
  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
