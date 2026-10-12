'use strict';
// Creates TWO throwaway tenants (A = main, B = foreign) with users, roles,
// staff, a student and a payroll-free baseline, ONLY in eldermin_teacher_verify.
// Writes ids + a random password to BOOT_TEST_STATE (never committed).
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { requireLocalDb, TAG, STATE, mongoose } = require('./common');

(async () => {
  const uri = requireLocalDb();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const oid = () => new mongoose.Types.ObjectId();
  const stamp = Date.now().toString(36);
  const password = 'Bt!' + crypto.randomBytes(9).toString('hex');
  const passwordHash = await bcrypt.hash(password, 10);

  const mkTenant = async (suffix) => {
    const _id = oid();
    const slug = `${TAG}-${suffix}-${stamp}`;
    await db.collection('tenants').insertOne({ _id, slug, displayName: `S2a boot test ${suffix}`, plan: 'enterprise', status: 'active', activeModules: ['organization'], isSetupComplete: true, createdAt: new Date(), updatedAt: new Date() });
    return { _id, slug };
  };
  const A = await mkTenant('a');
  const B = await mkTenant('b');
  // ModulesService resolves the school by slug in the `schools` collection
  for (const t of [A, B]) await db.collection('schools').insertOne({ _id: new mongoose.Types.ObjectId(), tenantId: String(t._id), slug: t.slug, name: `S2a boot ${t.slug}`, activeModules: ['organization'], createdAt: new Date(), updatedAt: new Date() });

  const mkUser = async (t, key, primaryRole, extra = {}) => {
    const _id = oid();
    const email = `${key}.${stamp}@${t.slug}.test`;
    await db.collection('users').insertOne({
      _id, tenantId: String(t._id), institutionId: String(t._id), email, passwordHash, primaryRole, isActive: true,
      profile: { firstName: key, lastName: 'Boot' }, guardianOfStudentIds: [], linkedStudentId: null, customRoleId: null,
      // a pending reset token proves /auth/me strips these
      ...(key === 'owner' ? { resetPasswordTokenHash: 'deadbeef-reset-hash', resetPasswordExpires: new Date(Date.now() + 3600e3) } : {}),
      createdAt: new Date(), updatedAt: new Date(), ...extra,
    });
    return { _id: String(_id), email };
  };

  // The app (main) stores tenantId/institutionId/campusId on users and staff as STRINGS (newTid() returns the raw string and these paths are untyped), so the seed does the same. One active campus => campus-level roles get it automatically at login.
  const campus = oid();
  await db.collection('campuses').insertOne({ _id: campus, tenantId: String(A._id), schoolSlug: A.slug, name: 'BT Campus', code: 'BTC', isActive: true, createdAt: new Date(), updatedAt: new Date() });
  const student = oid();
  await db.collection('students').insertOne({ _id: student, tenantId: A._id, schoolSlug: A.slug, firstName: 'Boot', lastName: 'Student', guardians: [], createdAt: new Date(), updatedAt: new Date() });

  // custom roles in tenant A
  const roleFull = oid(), roleSub = oid();
  await db.collection('roles').insertMany([
    { _id: roleFull, schoolSlug: A.slug, name: 'BT Full Institution', moduleAccess: [{ moduleKey: 'institution', level: 'manage', subModuleKey: null }], isSystemDefault: false, createdAt: new Date(), updatedAt: new Date() },
    { _id: roleSub, schoolSlug: A.slug, name: 'BT Sub Institution', moduleAccess: [{ moduleKey: 'institution', subModuleKey: 'audit', level: 'manage' }], isSystemDefault: false, createdAt: new Date(), updatedAt: new Date() },
  ]);

  const users = {
    owner: await mkUser(A, 'owner', 'institution_owner'),
    principal: await mkUser(A, 'principal', 'principal'),
    admin: await mkUser(A, 'admin', 'admin'),
    hr_manager: await mkUser(A, 'hrmanager', 'hr_manager'),
    finance_manager: await mkUser(A, 'financemanager', 'finance_manager'),
    teacher: await mkUser(A, 'teacher', 'teacher'),
    parent: await mkUser(A, 'parent', 'parent', { guardianOfStudentIds: [student] }),
    student: await mkUser(A, 'student', 'student', { linkedStudentId: student }),
    custom_full_inst: await mkUser(A, 'customfull', 'teacher', { customRoleId: roleFull }),
    custom_sub_inst: await mkUser(A, 'customsub', 'teacher', { customRoleId: roleSub }),
    victim: await mkUser(A, 'victim', 'teacher'),
    admin_b: await mkUser(B, 'adminb', 'admin'),
    teacher_b: await mkUser(B, 'teacherb', 'teacher'),
  };

  // admin whose tenant row does not exist => token has no school => the fail-closed audit cannot attribute the change
  const orphanTenant = String(oid());
  const orphan = await mkUser({ _id: orphanTenant, slug: 'none' }, 'orphanadmin', 'admin');
  await db.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(orphan._id) }, { $set: { tenantId: orphanTenant, institutionId: orphanTenant } });
  users.orphan_admin = orphan;

  // staff (fake sensitive values) in tenant A; one linked to the teacher login
  const mkStaff = async (n, userId) => {
    const _id = oid();
    await db.collection('staff').insertOne({
      _id, tenantId: String(A._id), institutionId: String(A._id), campusId: String(campus), employeeId: `BT-${stamp}-${n}`, firstName: `Staff${n}`, lastName: 'Boot',
      email: `staff${n}.${stamp}@x.test`, phone: '0300000000', designation: 'Teacher', department: 'Science', status: 'active', isActive: true,
      salary: 100000 + n, bankDetails: { bankName: 'FakeBank', accountNumber: `FAKEACC00${n}${n}${n}${n}`, iban: 'XX00FAKE0000000000000000' },
      identityDocs: { cnic: '11111-1111111-' + n }, userId: userId ? new mongoose.Types.ObjectId(userId) : null, supervisedClusterIds: [],
      createdAt: new Date(), updatedAt: new Date(),
    });
    return String(_id);
  };
  const staff = [await mkStaff(1, users.teacher._id), await mkStaff(2, null), await mkStaff(3, null), await mkStaff(4, users.custom_full_inst._id), await mkStaff(5, users.custom_sub_inst._id)];

  // module ids to toggle
  const moduleId = 'finance';

  fs.writeFileSync(STATE, JSON.stringify({ stamp, password, tenantA: { id: String(A._id), slug: A.slug }, tenantB: { id: String(B._id), slug: B.slug }, users, staff, student: String(student), roles: { full: String(roleFull), sub: String(roleSub) }, moduleId, orphanTenant }, null, 2));
  console.log(`seeded tenants ${A.slug}, ${B.slug}; ${Object.keys(users).length} users; ${staff.length} staff; state -> ${STATE}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
