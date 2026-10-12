'use strict';
// Removes everything the seed/run created: any document whose tenantId is one
// of the two throwaway tenants, or whose schoolSlug/slug starts with the
// throwaway tag. Touches only those documents, only in eldermin_teacher_verify.
const fs = require('fs');
const { requireLocalDb, TAG, STATE, mongoose } = require('./common');

(async () => {
  const uri = requireLocalDb();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const ids = [st.tenantA.id, st.tenantB.id].map((i) => new mongoose.Types.ObjectId(i));
  const slugRe = new RegExp(`^${TAG}-[ab]-${st.stamp}$`);
  const report = {};
  for (const c of await db.listCollections().toArray()) {
    const col = db.collection(c.name);
    const r = await col.deleteMany({ $or: [{ tenantId: { $in: ids } }, { tenantId: { $in: ids.map(String) } }, { schoolSlug: slugRe }, ...(c.name === 'tenants' ? [{ _id: { $in: ids } }] : [])] });
    if (r.deletedCount) report[c.name] = r.deletedCount;
  }
  if (st.orphanTenant) { const r = await db.collection('users').deleteMany({ tenantId: st.orphanTenant }); report.users_orphan = r.deletedCount; }
  console.log('deleted:', JSON.stringify(report));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
