'use strict';
// S1 (account deactivation) real-boot checks. App must be running (log or enforce mode both fine).
// Every removal path -> subsequent /auth/login rejected generically, reset/forgot blocked, parent OTP
// blocked for an inactive parent, shared account demoted (keeps parent-portal, loses staff routes),
// reactivation restores + audited, exit cron (real service, real Mongo, controlled clock),
// institution suspension, and the migration script dry-run vs apply (child process, dist build).
// usage: node run-s1.js <label>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const bcrypt = require('bcryptjs');
const { requireLocalDb, STATE, mongoose } = require('./common');
const REPO = path.resolve(__dirname, '..', '..');
const API = (process.env.BOOT_TEST_BASE || 'http://127.0.0.1:3917') + '/api/v1';
const label = process.argv[2] || 's1';
const GENERIC = 'Invalid credentials';

async function http(method, p, token, body) {
  const res = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let json = null; try { json = JSON.parse(t); } catch { /* */ }
  return { status: res.status, json };
}

(async () => {
  requireLocalDb();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  st.extraCleanup = st.extraCleanup || [];
  const save = () => fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const O = (x) => new mongoose.Types.ObjectId(x);
  const login = async (email, password) => http('POST', '/auth/login', null, { email, password });
  const tokens = {};
  for (const r of ['hr_manager', 'owner', 'teacher']) tokens[r] = (await login(st.users[r].email, st.password)).json?.accessToken;
  const R = []; // rows for the report
  const row = (path_, step, expected, actual, ok) => { R.push({ path: path_, step, expected, actual, ok }); };
  const stamp = Date.now().toString(36);

  // create a staff + app-created login; returns {staffId, email, password, userId}
  async function mkStaff(tag, extra = {}) {
    const email = `${tag}.${stamp}@${st.tenantA.slug}.test`;
    const s = await http('POST', '/hr/staff', tokens.hr_manager, { firstName: tag, lastName: 'S1', email, employeeId: `S1-${tag}-${stamp}`, department: 'Science', designation: 'Teacher', erpRole: 'teacher', ...extra });
    const staffId = s.json?._id;
    const cl = await http('POST', `/hr/staff/${staffId}/create-login`, tokens.hr_manager, {});
    const lg = await login(email, cl.json?.tempPassword);
    const userId = (await db.collection('users').findOne({ email }))?._id;
    // The app stores staff.userId as an ObjectId; mirror main's string/ObjectId reality: leave as the app wrote it.
    return { staffId, email, password: cl.json?.tempPassword, userId: String(userId), loginBefore: lg.status, token: lg.json?.accessToken };
  }
  async function assertRejected(p, step, a) {
    const r = await login(a.email, a.password);
    row(p, step + ': /auth/login', `401 "${GENERIC}"`, `${r.status} "${r.json?.message}"`, r.status === 401 && r.json?.message === GENERIC);
    const f = await http('POST', '/auth/forgot-password', null, { email: a.email });
    row(p, step + ': forgot-password', '201/200 generic message', `${f.status} "${f.json?.message}"`, f.status < 300 && /If an account exists/.test(f.json?.message || ''));
    // a reset token present on the account (e.g. issued before deactivation) must not work
    const raw = crypto.randomBytes(8).toString('hex'); const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await db.collection('users').updateOne({ _id: O(a.userId) }, { $set: { resetPasswordTokenHash: hash, resetPasswordExpires: new Date(Date.now() + 3600e3) } });
    const rs = await http('POST', '/auth/reset-password', null, { token: raw, newPassword: 'NewPass#12345' });
    row(p, step + ': reset-password with a stale token', '401 "This reset link is invalid or has expired"', `${rs.status} "${rs.json?.message}"`, rs.status === 401 && /invalid or has expired/.test(rs.json?.message || ''));
    const u = await db.collection('users').findOne({ _id: O(a.userId) });
    row(p, step + ': User document', 'isActive=false, deactivatedAt/Reason set', `isActive=${u.isActive} reason=${u.deactivationReason} at=${!!u.deactivatedAt}`, u.isActive === false && !!u.deactivatedAt);
  }

  // ---------- P1 soft delete ----------
  const a1 = await mkStaff('p1soft'); row('DELETE /hr/staff/:id (soft)', 'before: login works', '200', a1.loginBefore, a1.loginBefore === 200);
  const d1 = await http('DELETE', `/hr/staff/${a1.staffId}`, tokens.hr_manager); row('DELETE /hr/staff/:id (soft)', 'delete', '200', d1.status, d1.status === 200);
  await assertRejected('DELETE /hr/staff/:id (soft)', 'after', a1);
  // ---------- P2 hard delete ----------
  const a2 = await mkStaff('p2hard');
  const d2 = await http('DELETE', `/hr/staff/${a2.staffId}?hardDelete=true`, tokens.hr_manager); row('DELETE /hr/staff/:id?hardDelete=true', 'delete', '200', d2.status, d2.status === 200);
  const gone = await db.collection('staff').findOne({ _id: O(a2.staffId) });
  row('DELETE /hr/staff/:id?hardDelete=true', 'Staff row removed', 'null', gone === null ? 'null' : 'present', gone === null);
  await assertRejected('DELETE /hr/staff/:id?hardDelete=true', 'after', a2);
  // ---------- P3 status dropdown raw $set ----------
  for (const [tag, body] of [['p3resigned', { status: 'resigned' }], ['p3suspended', { status: 'suspended' }], ['p3terminated', { status: 'terminated' }], ['p3inactive', { isActive: false }]]) {
    const a = await mkStaff(tag); const pr = await http('PATCH', `/hr/staff/${a.staffId}`, tokens.hr_manager, body);
    row(`PATCH /hr/staff/:id ${JSON.stringify(body)} (profile status dropdown)`, 'patch', '200', pr.status, pr.status === 200);
    await assertRejected(`PATCH /hr/staff/:id ${JSON.stringify(body)}`, 'after', a);
  }
  for (const tag of ['p3onleave', 'p3probation']) {
    const a = await mkStaff(tag); const pr = await http('PATCH', `/hr/staff/${a.staffId}`, tokens.hr_manager, { status: tag === 'p3onleave' ? 'on_leave' : 'probation' });
    const r = await login(a.email, a.password);
    row(`PATCH /hr/staff/:id {status:${tag === 'p3onleave' ? 'on_leave' : 'probation'}}`, 'login still works (decision 5)', '200', `${pr.status}/${r.status}`, pr.status === 200 && r.status === 200);
  }
  // ---------- P4 exit: manual complete + cron ----------
  const a4 = await mkStaff('p4manual');
  const ex = await http('POST', '/hr/exit', tokens.hr_manager, { staffId: a4.staffId, exitType: 'resignation', resignationDate: '2026-12-01', lastWorkingDay: '2099-01-01' });
  const before4 = await login(a4.email, a4.password);
  row('POST /hr/exit (future lastWorkingDay)', 'creating the record changes nothing', '201 + login 200', `${ex.status} + ${before4.status}`, ex.status === 201 && before4.status === 200);
  const cp = await http('POST', `/hr/exit/${ex.json?._id}/complete`, tokens.hr_manager);
  row('POST /hr/exit/:id/complete (manual)', 'complete', '201', cp.status, cp.status < 300);
  await assertRejected('POST /hr/exit/:id/complete (manual)', 'after', a4);
  const cp2 = await http('POST', `/hr/exit/${ex.json?._id}/complete`, tokens.hr_manager);
  row('POST /hr/exit/:id/complete (again)', 'idempotent', 'alreadyProcessed:true', JSON.stringify(cp2.json), cp2.json?.alreadyProcessed === true);
  const cpT = await http('POST', `/hr/exit/${ex.json?._id}/complete`, tokens.teacher);
  row('POST /hr/exit/:id/complete (teacher)', 'forbidden', '403', cpT.status, cpT.status === 403);

  // cron: REAL ExitAccessService + AccountAccessService on real Mongo, controlled clock
  const a5 = await mkStaff('p5cron');
  const ex5 = await http('POST', '/hr/exit', tokens.hr_manager, { staffId: a5.staffId, exitType: 'termination', resignationDate: '2026-12-01', lastWorkingDay: '2026-12-31' });
  const dist = (p_) => require(path.join(REPO, 'dist', p_));
  const { ExitAccessService } = dist('modules/hr/exit-access.service.js');
  const { AccountAccessService } = dist('modules/auth/account-access.service.js');
  const { CriticalAuditService } = dist('common/critical-audit.service.js');
  const { ExitRecordSchema } = dist('modules/hr/schemas/exit-record.schema.js');
  const { StaffSchema } = dist('modules/hr/schemas/staff.schema.js');
  const { UserSchema } = dist('modules/organization/schemas/user.schema.js');
  const { TenantSchema } = dist('modules/organization/schemas/tenant.schema.js');
  const { SchoolSchema } = dist('organization/schemas/organization.schema.js');
  const { AuditLogSchema } = dist('compliance/schemas/compliance.schema.js');
  const M = (n, s_) => mongoose.models[n] || mongoose.model(n, s_);
  const audit = new CriticalAuditService(M('AuditLog', AuditLogSchema));
  const access = new AccountAccessService(M('User', UserSchema), M('Tenant', TenantSchema), M('AuditLog', AuditLogSchema), audit);
  const cron = new ExitAccessService(M('ExitRecord', ExitRecordSchema), M('Staff', StaffSchema), M('Tenant', TenantSchema), M('School', SchoolSchema), access);
  const tenantsBefore = await db.collection('exitRecords').countDocuments({});
  // the throwaway school has no timezone set -> default Asia/Karachi
  const early = await cron.processDueExits(new Date('2026-12-31T18:59:00Z'));
  const l5a = await login(a5.email, a5.password);
  row('exit cron: 18:59Z on 2026-12-31 (Karachi still on its last day)', 'nothing revoked', 'processed 0 (for this tenant) + login 200', `${JSON.stringify(early)} + ${l5a.status}`, l5a.status === 200);
  const on = await cron.processDueExits(new Date('2026-12-31T19:00:00Z'));
  row('exit cron: 19:00Z (= 00:00 Jan 1 Karachi)', 'revoked', 'processed >= 1', JSON.stringify(on), on.processed >= 1);
  await assertRejected('exit cron', 'after', a5);
  const s5 = await db.collection('staff').findOne({ _id: O(a5.staffId) });
  row('exit cron', 'Staff row', 'status=terminated isActive=false', `status=${s5.status} isActive=${s5.isActive}`, s5.status === 'terminated' && s5.isActive === false);
  const again = await cron.processDueExits(new Date('2026-12-31T19:00:00Z'));
  const [x, y] = await Promise.all([cron.processDueExits(new Date('2027-01-02T00:00:00Z')), cron.processDueExits(new Date('2027-01-02T00:00:00Z'))]);
  row('exit cron: run again / concurrently', 'idempotent', 'processed 0 each time (nothing left for our tenants)', `${JSON.stringify(again)} ${JSON.stringify(x)} ${JSON.stringify(y)}`, again.processed === 0 && x.processed + y.processed === 0);

  // ---------- P6 shared account ----------
  const a6 = await mkStaff('p6shared', { campusId: undefined });
  await db.collection('users').updateOne({ _id: O(a6.userId) }, { $set: { guardianOfStudentIds: [O(st.student)] } });
  const pre = await login(a6.email, a6.password);
  const d6 = await http('DELETE', `/hr/staff/${a6.staffId}`, tokens.hr_manager);
  row('DELETE staff who is ALSO a guardian (shared account)', 'delete', '200', d6.status, d6.status === 200);
  const post = await login(a6.email, a6.password);
  row('shared account', '/auth/login after removal', '200 with role parent, no staff scope', `${post.status} role=${post.json?.user?.role} campusId=${post.json?.user?.campusId} dept=${post.json?.user?.department}`, post.status === 200 && post.json?.user?.role === 'parent' && !post.json?.user?.department);
  const ps = await http('GET', '/parent-portal/my-students', post.json?.accessToken);
  row('shared account', 'parent-portal route with the NEW login', '200', ps.status, ps.status === 200);
  const h1 = await http('GET', '/hr/payslips', post.json?.accessToken); const h2 = await http('GET', '/hr/staff', post.json?.accessToken); const h3 = await http('POST', '/hr/payroll/runs', post.json?.accessToken, { month: 1, year: 2060 });
  row('shared account', 'staff routes (/hr/payslips, /hr/staff, POST /hr/payroll/runs)', '403 / 403 / 403', `${h1.status} / ${h2.status} / ${h3.status}`, h1.status === 403 && h2.status === 403 && h3.status === 403);
  const u6 = await db.collection('users').findOne({ _id: O(a6.userId) });
  row('shared account', 'User document', 'isActive true, primaryRole parent, previousPrimaryRole teacher, guardian link kept', `isActive=${u6.isActive} role=${u6.primaryRole} prev=${u6.previousPrimaryRole} guardians=${(u6.guardianOfStudentIds || []).length}`, u6.isActive === true && u6.primaryRole === 'parent' && u6.previousPrimaryRole === 'teacher' && (u6.guardianOfStudentIds || []).length === 1);
  const rs6 = await http('POST', `/hr/staff/${a6.staffId}/reset-password`, tokens.hr_manager, {});
  row('shared account', 'HR reset-password on a demoted login', '400 deactivated', `${rs6.status} ${rs6.json?.message}`, rs6.status === 400);

  // ---------- P7 reactivation ----------
  const noReason = await http('POST', `/hr/staff/${a1.staffId}/reactivate`, tokens.hr_manager, {});
  row('POST /hr/staff/:id/reactivate', 'reason required', '400', noReason.status, noReason.status === 400);
  const tReact = await http('POST', `/hr/staff/${a1.staffId}/reactivate`, tokens.teacher, { reason: 'x' });
  row('POST /hr/staff/:id/reactivate (teacher)', 'forbidden', '403', tReact.status, tReact.status === 403);
  const re1 = await http('POST', `/hr/staff/${a1.staffId}/reactivate`, tokens.hr_manager, { reason: 'Rehired for term 2' });
  const l1 = await login(a1.email, a1.password);
  row('POST /hr/staff/:id/reactivate (HR)', 'restores login', '201 + login 200', `${re1.status} ${JSON.stringify(re1.json)} + ${l1.status}`, re1.status < 300 && l1.status === 200);
  const re6 = await http('POST', `/hr/staff/${a6.staffId}/reactivate`, tokens.hr_manager, { reason: 'Rehired as teacher' });
  const l6 = await login(a6.email, a6.password);
  const u6b = await db.collection('users').findOne({ _id: O(a6.userId) });
  row('reactivate a DEMOTED shared account', 'role restored, guardian link kept', 'role teacher, guardians 1, demotion fields cleared', `${re6.status} role=${u6b.primaryRole} guardians=${(u6b.guardianOfStudentIds || []).length} revokedAt=${u6b.staffAccessRevokedAt ?? 'cleared'} login=${l6.status}/${l6.json?.user?.role}`, u6b.primaryRole === 'teacher' && !u6b.staffAccessRevokedAt && (u6b.guardianOfStudentIds || []).length === 1);
  const aud = await db.collection('audit_logs').find({ schoolSlug: st.tenantA.slug, module: 'Account Access' }).project({ action: 1, outcome: 1, performedBy: 1, newValue: 1 }).toArray();
  const react = aud.filter(a => a.action === 'Reactivate login');
  row('audit trail', 'Reactivate entries (who/why)', '>=2 applied, reason in newValue, performedBy set', JSON.stringify(react.map(a => ({ outcome: a.outcome, by: !!a.performedBy, why: /Rehired/.test(a.newValue || '') }))), react.length >= 2 && react.every(a => a.outcome === 'applied' && a.performedBy));
  row('audit trail', 'Deactivate / Demote entries', '>=1 each', JSON.stringify(aud.filter(a => a.action !== 'Reactivate login').map(a => a.action).reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {})), aud.some(a => a.action === 'Deactivate login') && aud.some(a => a.action === 'Demote shared login to parent'));
  const undoStale = await http('PATCH', `/hr/staff/${a1.staffId}`, tokens.hr_manager, { status: 'resigned' });
  const back = await http('PATCH', `/hr/staff/${a1.staffId}`, tokens.hr_manager, { status: 'active' });
  const l1b = await login(a1.email, a1.password);
  row('PATCH status back to active (audited auto-reactivation)', 'login restored', '200/200 + login 200', `${undoStale.status}/${back.status} + ${l1b.status}`, back.status === 200 && l1b.status === 200);

  // ---------- P8 parent OTP ----------
  const phone = '+92300' + String(Math.floor(1000000 + Math.random() * 8999999));
  const parentActive = { _id: new mongoose.Types.ObjectId(), tenantId: String(st.tenantA.id), institutionId: String(st.tenantA.id), email: `pa.${stamp}@${st.tenantA.slug}.test`, phone, passwordHash: await bcrypt.hash('x', 4), primaryRole: 'parent', isActive: true, profile: { firstName: 'P', lastName: 'Active' }, guardianOfStudentIds: [O(st.student)], customRoleId: null, createdAt: new Date(), updatedAt: new Date() };
  await db.collection('users').insertOne(parentActive);
  await db.collection('students').updateOne({ _id: O(st.student) }, { $set: { guardians: [{ name: 'Guard', phone, email: parentActive.email }] } });
  st.extraCleanup.push({ collection: 'phone_otps', filter: { phone: phone.replace(/\D/g, '') } }, { collection: 'phone_otps', filter: { phone } });
  const normalized = phone.replace(/[^\d+]/g, '');
  const putOtp = async () => { await db.collection('phone_otps').deleteMany({ phone: normalized }); await db.collection('phone_otps').insertOne({ phone: normalized, codeHash: await bcrypt.hash('123456', 4), expiresAt: new Date(Date.now() + 600e3), attempts: 0, consumedAt: null, createdAt: new Date(), updatedAt: new Date() }); };
  st.extraCleanup.push({ collection: 'phone_otps', filter: { phone: normalized } });
  const reqA = await http('POST', '/parent-portal/auth/request-otp', null, { phone });
  await putOtp(); const verA = await http('POST', '/parent-portal/auth/verify-otp', null, { phone, code: '123456' });
  row('parent OTP (ACTIVE parent, control)', 'request + verify', '2xx + session', `${reqA.status} + ${verA.status} token=${!!verA.json?.accessToken}`, verA.status < 300 && !!verA.json?.accessToken);
  await db.collection('users').updateOne({ _id: parentActive._id }, { $set: { isActive: false, deactivatedAt: new Date(), deactivationReason: 'boot_test' } });
  await db.collection('phone_otps').deleteMany({ phone: normalized });
  const reqI = await http('POST', '/parent-portal/auth/request-otp', null, { phone });
  await putOtp(); const verI = await http('POST', '/parent-portal/auth/verify-otp', null, { phone, code: '123456' });
  row('parent OTP (INACTIVE parent)', 'request-otp', '404 "No student record found with this WhatsApp number..."', `${reqI.status} "${(reqI.json?.message || '').slice(0, 60)}"`, reqI.status === 404 && /No student record found/.test(reqI.json?.message || ''));
  row('parent OTP (INACTIVE parent)', 'verify-otp with a valid code: no session', '404 generic, no accessToken', `${verI.status} "${(verI.json?.message || '').slice(0, 60)}" token=${!!verI.json?.accessToken}`, verI.status === 404 && !verI.json?.accessToken);
  const dup = await db.collection('users').countDocuments({ phone });
  row('parent OTP (INACTIVE parent)', 'no second account created for the phone', '1', dup, dup === 1);
  await db.collection('students').updateOne({ _id: O(st.student) }, { $set: { guardians: [] } });

  // ---------- P9 institution suspension ----------
  const instSlug = st.tenantA.slug;
  await db.collection('institutions').insertOne({ _id: new mongoose.Types.ObjectId(), slug: instSlug, name: 'S2a boot inst', status: 'active', createdAt: new Date(), updatedAt: new Date() });
  st.extraCleanup.push({ collection: 'institutions', filter: { slug: instSlug } }, { collection: 'subscription_history', filter: { institutionSlug: instSlug } }, { collection: 'subscriptionhistories', filter: { institutionSlug: instSlug } });
  const saId = new mongoose.Types.ObjectId(); const saEmail = `sa.${stamp}@s2a-boot-super.test`;
  await db.collection('users').insertOne({ _id: saId, email: saEmail, passwordHash: await bcrypt.hash('SuperAdmin#1', 4), primaryRole: 'super_admin', isActive: true, profile: { firstName: 'SA', lastName: 'Boot' }, createdAt: new Date(), updatedAt: new Date() });
  st.extraCleanup.push({ collection: 'users', filter: { _id: saId } }); save();
  const saTok = (await login(saEmail, 'SuperAdmin#1')).json?.accessToken;
  const susp = await http('PATCH', `/super-admin/institutions/${instSlug}/status`, saTok, { status: 'suspended', reason: 'boot test' });
  const tA = await db.collection('tenants').findOne({ _id: O(st.tenantA.id) });
  const lOwner = await login(st.users.owner.email, st.password);
  row('PATCH /super-admin/institutions/:slug/status suspended', 'Tenant.status + login of the school', `2xx, tenant suspended, login 403 "Account suspended"`, `${susp.status}, tenant=${tA.status}, login=${lOwner.status} "${lOwner.json?.message}"`, susp.status < 300 && tA.status === 'suspended' && lOwner.status === 403);
  const act = await http('PATCH', `/super-admin/institutions/${instSlug}/status`, saTok, { status: 'active', reason: 'paid' });
  const tA2 = await db.collection('tenants').findOne({ _id: O(st.tenantA.id) });
  const lOwner2 = await login(st.users.owner.email, st.password);
  row('PATCH /super-admin/institutions/:slug/status active', 'lifts it', '2xx, tenant active, login 200', `${act.status}, tenant=${tA2.status}, login=${lOwner2.status}`, act.status < 300 && tA2.status === 'active' && lOwner2.status === 200);

  // ---------- P10 migration script: dry-run vs apply ----------
  const a10 = await mkStaff('p10orphan');
  await db.collection('staff').updateOne({ _id: O(a10.staffId) }, { $set: { status: 'terminated', isActive: false } }); // bypass the hooks: a genuine orphan
  const a11 = await mkStaff('p10shared');
  await db.collection('users').updateOne({ _id: O(a11.userId) }, { $set: { guardianOfStudentIds: [O(st.student)] } });
  await db.collection('staff').updateOne({ _id: O(a11.staffId) }, { $set: { status: 'resigned', isActive: false } });
  const node = process.execPath; const script = path.join(REPO, 'dist', 'scripts', 'audit-orphaned-staff-logins.js');
  const backupDir = process.env.BOOT_TEST_BACKUP_DIR || path.join(path.dirname(STATE), 'backups');
  const run = (extra) => spawnSync(node, [script, `--uri=${process.env.MONGODB_URI}`, `--backup-dir=${backupDir}`, ...extra], { encoding: 'utf8', cwd: path.dirname(STATE) });
  const dry = run([]);
  const mine = (txt) => (txt.match(/tenant ([0-9a-f]{24})/g) || []).map(s => s.slice(7));
  const tenantsInReport = [...new Set(mine(dry.stdout))];
  row('migration script: dry-run', 'prints target + counts/ids; lists ONLY the throwaway tenant; no PII', `exit 0, tenants=[${st.tenantA.id}]`, `exit ${dry.status}, tenants=[${tenantsInReport}], hasEmail=${/@/.test(dry.stdout)}`, dry.status === 0 && tenantsInReport.length === 1 && tenantsInReport[0] === st.tenantA.id && !/@/.test(dry.stdout));
  const u10a = await db.collection('users').findOne({ _id: O(a10.userId) });
  row('migration script: dry-run', 'changed nothing', 'orphan still active, no backup dir', `isActive=${u10a.isActive}, backups=${fs.existsSync(backupDir)}`, u10a.isActive === true && !fs.existsSync(backupDir));
  const noConfirm = run(['--apply']);
  row('migration script: --apply without --confirm-db', 'refused', 'exit 3, nothing changed', `exit ${noConfirm.status}: ${(noConfirm.stdout.split('\n').find(l => /Refusing/.test(l)) || '').slice(0, 90)}`, noConfirm.status === 3);
  const wrong = run(['--apply', '--confirm-db=some_other_db']);
  row('migration script: --apply with the WRONG --confirm-db', 'refused', 'exit 3', `exit ${wrong.status}`, wrong.status === 3);
  let applied = { status: -1, stdout: '' };
  if (tenantsInReport.length === 1 && tenantsInReport[0] === st.tenantA.id) applied = run(['--apply', '--confirm-db=eldermin_teacher_verify']);
  const files = fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [];
  const u10b = await db.collection('users').findOne({ _id: O(a10.userId) }); const u11b = await db.collection('users').findOne({ _id: O(a11.userId) });
  row('migration script: --apply --confirm-db=eldermin_teacher_verify', 'backup written+verified, then changes', 'exit 0; plain user inactive; shared user demoted (active, parent); backup + .sha256 exist', `exit ${applied.status}; plain isActive=${u10b.isActive}; shared isActive=${u11b.isActive} role=${u11b.primaryRole}; files=${files.length}`, applied.status === 0 && u10b.isActive === false && u11b.isActive === true && u11b.primaryRole === 'parent' && files.length === 2);
  const bk = files.find(f => f.endsWith('.json')); const bkTxt = bk ? fs.readFileSync(path.join(backupDir, bk), 'utf8') : '';
  row('migration script: backup file', 'contains both users, no secrets', 'users 2, no passwordHash', `users=${bkTxt ? JSON.parse(bkTxt).users.length : 0}, hasPasswordHash=${/passwordHash/.test(bkTxt)}`, bkTxt && JSON.parse(bkTxt).users.length === 2 && !/passwordHash/.test(bkTxt));
  const second = run(['--apply', '--confirm-db=eldermin_teacher_verify']);
  row('migration script: second --apply', 'idempotent', 'exit 0, "Nothing to change."', `exit ${second.status}, ${/Nothing to change/.test(second.stdout)}`, second.status === 0 && /Nothing to change/.test(second.stdout));
  const lOrph = await login(a10.email, a10.password); const lShared = await login(a11.email, a11.password);
  row('migration script: effect', 'orphan login rejected generically; shared account still logs in as parent', `401 "${GENERIC}" / 200 parent`, `${lOrph.status} "${lOrph.json?.message}" / ${lShared.status} ${lShared.json?.user?.role}`, lOrph.status === 401 && lShared.status === 200 && lShared.json?.user?.role === 'parent');

  const bad = R.filter(r => !r.ok);
  const md = ['| path | step | expected | actual | ok |', '|---|---|---|---|---|', ...R.map(r => `| ${r.path} | ${r.step} | ${String(r.expected).replace(/\|/g, '/')} | ${String(r.actual).replace(/\|/g, '/')} | ${r.ok ? 'yes' : '**NO**'} |`)];
  console.log(md.join('\n')); console.log(`\nTOTAL ${R.length}, FAILED ${bad.length}`);
  if (bad.length) console.log('FAILED:', JSON.stringify(bad, null, 1));
  fs.writeFileSync(`.boot-s1-${label}.md`, md.join('\n'));
  st.backupDir = backupDir; save();
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
