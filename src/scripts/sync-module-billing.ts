import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { MODULE_REGISTRY, computeModulePricing } from '../modules/module-registry';

// ============================================================
// SYNC MODULE BILLING — one-time fix for the School/Tenant/Institution
// activeModules drift found in production (see ModulesService -
// syncAcrossCollections is the going-forward fix; this repairs data that
// already drifted before that existed).
//
// Usage:
//   npm run sync:module-billing
//     -> for every School, unions School.activeModules with the matching
//        Tenant.activeModules, writes the union back to both, and syncs
//        the Super Admin Institution tracking row's enabledModules +
//        monthlyRevenue (logging a SubscriptionHistory event on change).
//
//   npm run sync:module-billing -- --activate-all=demo-school
//     -> additionally force-activates EVERY registry module for the
//        given school slug, instead of just unioning what's already
//        there. Use this for a school that's genuinely using (or should
//        have access to) every module, rather than clicking "Activate"
//        16 times in the UI.
// ============================================================
async function run() {
  const activateAllSlug = process.argv.find((a) => a.startsWith('--activate-all='))?.split('=')[1];

  console.log('Starting module/billing sync...');
  if (activateAllSlug) console.log(`Will also force-activate ALL modules for: ${activateAllSlug}`);

  const app = await NestFactory.createApplicationContext(AppModule);

  const schoolModel = app.get(getModelToken('School'));
  const tenantModel = app.get(getModelToken('Tenant'));
  const institutionModel = app.get(getModelToken('Institution'));
  const subHistoryModel = app.get(getModelToken('SubscriptionHistory'));

  const schools = await schoolModel.find().select('slug activeModules name').lean();
  console.log(`Found ${schools.length} school(s).`);

  let changed = 0;
  for (const school of schools as any[]) {
    const slug = school.slug;
    const tenant = await tenantModel.findOne({ slug }).select('activeModules').lean();

    const fromSchool: string[] = school.activeModules || [];
    const fromTenant: string[] = (tenant as any)?.activeModules || [];
    const forceAll = activateAllSlug && slug === activateAllSlug;

    const updated = forceAll
      ? MODULE_REGISTRY.map((m) => m.id)
      : Array.from(new Set(['organization', ...fromSchool, ...fromTenant]));

    const alreadyInSync = !forceAll
      && JSON.stringify([...fromSchool].sort()) === JSON.stringify([...updated].sort())
      && JSON.stringify([...fromTenant].sort()) === JSON.stringify([...updated].sort());
    if (alreadyInSync) continue;

    await Promise.all([
      schoolModel.updateOne({ slug }, { $set: { activeModules: updated } }),
      tenantModel.updateOne({ slug }, { $set: { activeModules: updated } }),
    ]);

    const institution = await institutionModel.findOne({ slug });
    if (institution) {
      const { monthlyRevenue, lineItems } = computeModulePricing(updated);
      const previousRevenue = institution.monthlyRevenue || 0;
      institution.enabledModules = updated;
      institution.monthlyRevenue = monthlyRevenue;
      await institution.save();

      if (monthlyRevenue !== previousRevenue) {
        await new subHistoryModel({
          institutionSlug: slug,
          institutionName: institution.name,
          event: monthlyRevenue > previousRevenue ? 'upgrade' : 'downgrade',
          fromPlan: institution.plan,
          toPlan: institution.plan,
          amount: monthlyRevenue,
          paymentStatus: 'pending',
          notes: `Module/billing sync: ${lineItems.map((li) => li.name).join(', ') || 'none'} (PKR ${monthlyRevenue.toLocaleString()}/mo)`,
          processedBy: 'sync-module-billing script',
          effectiveDate: new Date(),
        }).save();
      }
    }

    changed += 1;
    console.log(`  Synced ${slug}: ${updated.length} active module(s)${forceAll ? ' (forced all)' : ''}`);
  }

  console.log(`Done. ${changed} of ${schools.length} school(s) updated.`);
  await app.close();
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
