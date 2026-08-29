import { webcrypto } from 'crypto';
// Guarded like main.ts - Node 20+ already defines globalThis.crypto as a
// read-only getter, so an unconditional assignment throws the moment this
// module is ever imported (not just run standalone).
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';

async function seed() {
  console.log('Starting Eldermin seed...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const tenantModel = app.get(getModelToken('Tenant'));
  const userModel = app.get(getModelToken('User'));

  let tenant = await tenantModel.findOne({ slug: 'demo-school' });
  if (!tenant) {
    tenant = await tenantModel.create({
      slug: 'demo-school',
      displayName: 'Eldermin Demo School',
      plan: 'enterprise',
      status: 'active',
      activeModules: ['organization','human_resource','finance','admission','student_profile','documents_workflow','procurement','curriculum','assessment','behaviour','data_intelligence'],
      isSetupComplete: true,
    });
    console.log('Tenant created:', tenant.slug);
  } else {
    console.log('Tenant exists:', tenant.slug);
  }

  const existing = await userModel.findOne({ email: 'admin@demo-school.com' });
  if (!existing) {
    const passwordHash = await bcrypt.hash('Admin@1234', 12);
    await userModel.create({
      tenantId: tenant._id,
      institutionId: tenant._id,
      email: 'admin@demo-school.com',
      passwordHash,
      profile: { firstName: 'Atiq', lastName: 'Admin' },
      primaryRole: 'principal',
      isActive: true,
    });
    console.log('Admin created: admin@demo-school.com / Admin@1234');
  } else {
    console.log('Admin already exists');
  }

  console.log('Seed complete.');
  await app.close();
  process.exit(0);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
