'use strict';
// State-less cleanup: removes everything tagged by the boot-test seed (tenants whose slug starts with
// "s2a-boot-" and anything tied to them, the throwaway super_admin users @s2a-boot-super.test, phone
// OTP rows for the generated +92300xxxxxxx numbers, tagged platform institutions / subscription rows).
// Only touches the local verification DB (requireLocalDb). Use when the state file is lost.
const { requireLocalDb, mongoose } = require('./common');
(async () => {
  const uri = requireLocalDb();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const tenants = await db.collection('tenants').find({ slug: /^s2a-boot-/ }).project({ _id: 1, slug: 1 }).toArray();
  const ids = tenants.map((t) => t._id); const slugs = tenants.map((t) => t.slug);
  const report = {};
  const bump = (k, n) => { if (n) report[k] = (report[k] || 0) + n; };
  for (const c of await db.listCollections().toArray()) {
    const col = db.collection(c.name);
    const or = [{ tenantId: { $in: ids } }, { tenantId: { $in: ids.map(String) } }, { schoolSlug: { $in: slugs } }, { schoolSlug: /^s2a-boot-/ }];
    if (c.name === 'tenants') or.push({ _id: { $in: ids } });
    bump(c.name, (await col.deleteMany({ $or: or })).deletedCount);
  }
  bump('users(super_admin throwaway)', (await db.collection('users').deleteMany({ email: /@s2a-boot-super\.test$/ })).deletedCount);
  bump('users(orphan tenant)', (await db.collection('users').deleteMany({ email: /@s2a-boot-[ab]-[a-z0-9]+\.test$/ })).deletedCount);
  bump('users(orphan admin)', (await db.collection('users').deleteMany({ email: /^orphanadmin\.[a-z0-9]+@none\.test$/ })).deletedCount);
  bump('phone_otps', (await db.collection('phone_otps').deleteMany({ phone: /^\+?92300\d{7}$/ })).deletedCount);
  bump('platform_institutions', (await db.collection('platform_institutions').deleteMany({ slug: /^s2a-boot-/ })).deletedCount);
  bump('subscription_history', (await db.collection('subscription_history').deleteMany({ institutionSlug: /^s2a-boot-/ })).deletedCount);
  console.log('deleted:', JSON.stringify(report));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
