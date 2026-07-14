import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';

async function createSuperAdmin() {
  console.log('Creating Eldermin platform super-admin...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const tenantModel = app.get(getModelToken('Tenant'));
  const institutionModel = app.get(getModelToken('OrgInstitution'));
  const userModel = app.get(getModelToken('User'));

  const SUPER_ADMIN_EMAIL = 'superadmin@eldermin.com';
  const SUPER_ADMIN_PASSWORD = 'ElderminSuperAdmin@2026';

  let tenant = await tenantModel.findOne({ slug: 'eldermin-platform' });
  if (!tenant) {
    tenant = await tenantModel.create({
      slug: 'eldermin-platform',
      displayName: 'Eldermin Platform (Internal)',
      status: 'active',
      plan: 'enterprise',
      activeModules: [],
      isSetupComplete: true,
    });
    console.log('Created platform tenant:', tenant.slug);
  } else {
    console.log('Platform tenant already exists:', tenant.slug);
  }

  let institution = await institutionModel.findOne({ tenantId: tenant._id });
  if (!institution) {
    institution = await institutionModel.create({
      tenantId: tenant._id,
      name: 'Eldermin Platform',
      currency: 'PKR',
      isActive: true,
    });
    console.log('Created platform institution');
  }

  const existing = await userModel.findOne({ email: SUPER_ADMIN_EMAIL });
  if (existing) {
    console.log('Super-admin user already exists:', SUPER_ADMIN_EMAIL);
    if (existing.primaryRole !== 'super_admin') {
      await userModel.updateOne({ _id: existing._id }, { $set: { primaryRole: 'super_admin' } });
      console.log('Updated existing user role to super_admin');
    }
  } else {
    const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
    await userModel.create({
      tenantId: tenant._id,
      institutionId: institution._id,
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      profile: { firstName: 'Eldermin', lastName: 'SuperAdmin' },
      primaryRole: 'super_admin',
      isActive: true,
    });
    console.log('Created super-admin user:', SUPER_ADMIN_EMAIL);
    console.log('Password:', SUPER_ADMIN_PASSWORD);
    console.log('IMPORTANT: change this password after first login.');
  }

  await app.close();
  console.log('Done.');
}

createSuperAdmin().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
