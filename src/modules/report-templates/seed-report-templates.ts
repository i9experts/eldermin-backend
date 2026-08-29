// ============================================================
// SEED: Default Report Templates (Fee Receipt + Payment Voucher)
// Eldermin ERP | run with: npm run seed:report-templates
//
// Backfills any school that doesn't yet have these two starter templates —
// in particular every school that onboarded before OnboardingService was
// updated to seed them automatically at signup (see complete() there). Safe
// to re-run: each template is only created if that type's default doesn't
// already exist for the school.
// ============================================================

import { webcrypto } from 'crypto';
// Guarded like main.ts - Node 20+ already defines globalThis.crypto as a
// read-only getter, so an unconditional assignment throws the moment this
// module is ever imported (not just run standalone).
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { defaultReportTemplates } from './default-templates';

async function seedReportTemplates() {
  console.log('Starting report templates seed...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const schoolModel = app.get(getModelToken('School'));
  const reportTemplateModel = app.get(getModelToken('ReportTemplate'));

  const schools = await schoolModel.find().lean();

  if (!schools.length) {
    console.log('No schools found. Nothing to seed.');
    await app.close();
    process.exit(0);
  }

  for (const school of schools) {
    const schoolSlug = (school as any).slug;
    const templates = defaultReportTemplates(schoolSlug);

    for (const template of templates) {
      const existing = await reportTemplateModel.findOne({
        schoolSlug,
        type: template.type,
        isDefault: true,
      });

      if (!existing) {
        await reportTemplateModel.create(template);
        console.log(`[${schoolSlug}] Created: ${template.name}`);
      } else {
        console.log(`[${schoolSlug}] Skipped: ${template.type} default already exists`);
      }
    }
  }

  console.log('Report templates seed complete.');
  await app.close();
  process.exit(0);
}

seedReportTemplates().catch((err) => {
  console.error('Report templates seed failed:', err);
  process.exit(1);
});
