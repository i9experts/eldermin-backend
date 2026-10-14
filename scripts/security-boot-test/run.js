'use strict';
// Real-boot security matrix. Needs the app running on BOOT_TEST_BASE (default
// http://127.0.0.1:3917) and the seed state file. Logs in through the app's own
// /auth/login for every user, then calls key routes with each token and prints
// ACTUAL status codes as a role x route table (markdown) + JSON.
// usage: node run.js <label> [reads-only]
const fs = require('fs');
const { requireLocalDb, STATE, mongoose } = require('./common');
const BASE = process.env.BOOT_TEST_BASE || 'http://127.0.0.1:3917';
const API = BASE + '/api/v1';
const label = process.argv[2] || 'run';
const readsOnly = process.argv[3] === 'reads-only';

const ROLES = ['owner', 'principal', 'admin', 'hr_manager', 'finance_manager', 'teacher', 'parent', 'student', 'custom_full_inst', 'custom_sub_inst'];

async function http(method, path, token, body, headers = {}) {
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; const txt = await res.text(); try { json = JSON.parse(txt); } catch { /* pdf/binary */ }
  return { status: res.status, json };
}

(async () => {
  requireLocalDb();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const tokens = {}; const loginStatus = {};
  for (const [k, u] of Object.entries(st.users)) {
    const r = await http('POST', '/auth/login', null, { email: u.email, password: st.password });
    loginStatus[k] = r.status; tokens[k] = r.json?.accessToken;
  }
  const rows = []; // {route, byRole:{role:status}}
  const results = {};
  const rec = (route, role, status) => { (results[route] ||= {})[role] = status; };
  async function matrix(route, method, path, bodyFn, opts = {}) {
    for (const role of opts.roles || ROLES) {
      const body = typeof bodyFn === 'function' ? bodyFn(role) : bodyFn;
      const p = typeof path === 'function' ? path(role) : path;
      const r = await http(method, p, tokens[role], body, opts.headers?.(role) || {});
      rec(route, role, r.status);
      if (opts.after) await opts.after(role, r);
    }
  }
  const uniq = (role) => ROLES.indexOf(role) + 1;
  const ownerId = (k) => st.users[k]._id;
  const extra = {};

  // ---------- /auth/me ----------
  await matrix('GET /auth/me', 'GET', '/auth/me', undefined, { after: async (role, r) => { if (role === 'owner') extra.meOwnerKeys = Object.keys(r.json || {}).filter((k) => /password|reset/i.test(k)); } });

  if (!readsOnly) {
    // ---------- /roles ----------
    await matrix('GET /roles', 'GET', '/roles');
    await matrix('GET /roles/modules', 'GET', '/roles/modules');
    await matrix('POST /roles (create)', 'POST', '/roles', (r) => ({ name: `BT-${label}-${r}-${Date.now()}`, moduleAccess: [{ moduleKey: 'hr', level: 'view' }] }));
    await matrix('POST /roles/assign (SELF)', 'POST', '/roles/assign', (r) => ({ userId: ownerId(r), roleId: st.roles.full }));
    await matrix('POST /roles/assign (other tenant user)', 'POST', '/roles/assign', () => ({ userId: st.users.teacher_b._id, roleId: st.roles.full }));
    await matrix('POST /roles/assign (own-tenant victim, role=hr view)', 'POST', '/roles/assign', () => ({ userId: st.users.victim._id, roleId: null }));
    // grant above own level: custom_full_inst (institution:manage only) creates a role with finance manage
    await matrix('POST /roles (grant ABOVE own level)', 'POST', '/roles', (r) => ({ name: `BT-above-${label}-${r}-${Date.now()}`, moduleAccess: [{ moduleKey: 'finance', level: 'manage' }] }), { roles: ['owner', 'admin', 'custom_full_inst'] });

    // ---------- link / unlink guardian ----------
    await matrix('POST /parent-portal/link-guardian', 'POST', '/parent-portal/link-guardian', { email: `g.${st.stamp}@x.test`, studentIds: [st.student] });
    await matrix('POST /parent-portal/unlink-guardian', 'POST', '/parent-portal/unlink-guardian', { email: `g.${st.stamp}@x.test`, studentId: st.student });

    // ---------- fail-closed audit (real boot): admin whose token carries no school ----------
    { const before = await db.collection('payrollRuns').countDocuments({ tenantId: st.orphanTenant });
      const r = await http('POST', '/hr/payroll/runs', tokens.orphan_admin, { month: 5, year: 2050 });
      const afterN = await db.collection('payrollRuns').countDocuments({ tenantId: st.orphanTenant });
      extra.failClosedAudit = { status: r.status, message: r.json?.message, payrollRunsBefore: before, payrollRunsAfter: afterN }; }
    // ---------- HR writes ----------
    await matrix('POST /hr/staff', 'POST', '/hr/staff', (r) => ({ firstName: 'New', lastName: r, employeeId: `BTN-${st.stamp}-${label}-${r}`, designation: 'X', userId: st.users.victim._id }));
    await matrix('PATCH /hr/staff/:id {designation}', 'PATCH', () => `/hr/staff/${st.staff[1]}`, { designation: 'Updated' });
    await matrix('PATCH /hr/staff/:id {supervisedClusterIds} (Campuses)', 'PATCH', () => `/hr/staff/${st.staff[1]}`, { supervisedClusterIds: [] });
    await matrix('PATCH /hr/staff/:id {supervisedClusterIds+salary} (mixed)', 'PATCH', () => `/hr/staff/${st.staff[1]}`, { supervisedClusterIds: [], salary: 1 }, { roles: ['owner', 'custom_full_inst', 'custom_sub_inst', 'teacher'] });
    await matrix('PATCH /hr/staff/:id {userId,tenantId} (stripped)', 'PATCH', () => `/hr/staff/${st.staff[2]}`, { userId: st.users.victim._id, tenantId: st.tenantB.id, designation: 'Strip' }, { roles: ['owner', 'principal', 'admin'] });
    await matrix('POST /hr/staff/:id/reset-password', 'POST', () => `/hr/staff/${st.staff[1]}/reset-password`, {});
    await matrix('POST /hr/payroll/runs', 'POST', '/hr/payroll/runs', (r) => ({ month: 1, year: 2040 + uniq(r) }));
    let runId;
    { const rr = await http('POST', '/hr/payroll/runs', tokens.owner, { month: 2, year: 2039 }); runId = rr.json?._id; extra.runCreateOwner = rr.status; }
    await matrix('PATCH /hr/payroll/runs/:id/status (pay route)', 'PATCH', () => `/hr/payroll/runs/${runId}/status`, { status: 'processing' });
    await matrix('POST /hr/salary-components', 'POST', '/hr/salary-components', (r) => ({ name: `Comp ${r}`, code: `C${uniq(r)}${Date.now() % 100000}`, type: 'earning', calculationType: 'fixed', defaultAmount: 1 }));
    let payslipId;
    await matrix('POST /hr/payslips', 'POST', '/hr/payslips', (r) => ({ staffId: st.staff[0], month: uniq(r), year: 2035, basicSalary: 1000, payrollRunId: runId }), { after: async (role, r) => { if (r.status < 300 && !payslipId) payslipId = r.json?._id; } });
    if (!payslipId) { const ps = await db.collection('payslips').findOne({ tenantId: new mongoose.Types.ObjectId(st.tenantA.id) }); payslipId = ps && String(ps._id); }
    extra.payslipId = payslipId || null;
    await matrix('PATCH /hr/payslips/:id', 'PATCH', () => `/hr/payslips/${payslipId || '000000000000000000000000'}`, { notes: 'edited' });
    await matrix('POST /hr/leave/self/... (leave:self read)', 'GET', '/hr/leave/self/balance');
  }

  // ---------- HR reads ----------
  const staffFull = {};
  await matrix('GET /hr/staff (list)', 'GET', '/hr/staff', undefined, { after: async (role, r) => { const a = Array.isArray(r.json) ? r.json : []; staffFull[role] = a.length ? { n: a.length, hasSalary: 'salary' in a[0], hasBank: 'bankDetails' in a[0], hasIdDocs: 'identityDocs' in a[0], hasEmail: 'email' in a[0], keys: Object.keys(a[0]).length } : null; } });
  extra.staffListShape = staffFull;
  await matrix('GET /hr/staff/:id (full doc, SENSITIVE)', 'GET', () => `/hr/staff/${st.staff[0]}`);
  await matrix('GET /hr/attendance?date= (Academics timetable)', 'GET', '/hr/attendance?date=2026-10-12');
  await matrix('GET /hr/payslips (SENSITIVE)', 'GET', '/hr/payslips');
  await matrix('GET /hr/payroll/runs (SENSITIVE)', 'GET', '/hr/payroll/runs');
  await matrix('GET /hr/payroll/stats (SENSITIVE)', 'GET', '/hr/payroll/stats');
  await matrix('GET /hr/salary-components (SENSITIVE)', 'GET', '/hr/salary-components');
  await matrix('GET /hr/advances (SENSITIVE)', 'GET', '/hr/advances');
  await matrix('GET /hr/contracts (SENSITIVE)', 'GET', '/hr/contracts');
  await matrix('GET /hr/staff/:id/documents (SENSITIVE)', 'GET', () => `/hr/staff/${st.staff[0]}/documents`);
  await matrix('GET /hr/holidays (non-sensitive, flag-governed)', 'GET', '/hr/holidays');
  await matrix('GET /hr/designations (non-sensitive, flag-governed)', 'GET', '/hr/designations');
  await matrix('GET /hr/shifts (non-sensitive, flag-governed)', 'GET', '/hr/shifts');

  if (!readsOnly) {
    // ---------- /modules (tenant from JWT) ----------
    await matrix('GET /modules', 'GET', '/modules', undefined, { roles: ['owner', 'teacher'] });
    await matrix('POST /modules/:id/activate (header = OWN slug)', 'POST', () => `/modules/${st.moduleId}/activate`, {}, { headers: () => ({ 'x-school-slug': st.tenantA.slug }) });
    const before = await db.collection('tenants').findOne({ _id: new mongoose.Types.ObjectId(st.tenantB.id) });
    await matrix('POST /modules/:id/activate (header = FOREIGN slug)', 'POST', () => `/modules/${st.moduleId}/activate`, {}, { roles: ['owner', 'admin', 'teacher'], headers: () => ({ 'x-school-slug': st.tenantB.slug }) });
    const after = await db.collection('tenants').findOne({ _id: new mongoose.Types.ObjectId(st.tenantB.id) });
    const aT = await db.collection('tenants').findOne({ _id: new mongoose.Types.ObjectId(st.tenantA.id) });
    extra.modulesTenantB_activeModulesBefore = before.activeModules; extra.modulesTenantB_activeModulesAfter = after.activeModules; extra.modulesTenantA_activeModulesAfter = aT.activeModules;

    // ---------- pdf + organization with a foreign header ----------
    await matrix('POST /pdf/invoice (header = FOREIGN slug)', 'POST', '/pdf/invoice', { invoiceId: '000000000000000000000000' }, { roles: ['owner', 'admin', 'teacher'], headers: () => ({ 'x-school-slug': st.tenantB.slug }) });
    await matrix('POST /pdf/invoice (header = OWN slug)', 'POST', '/pdf/invoice', { invoiceId: '000000000000000000000000' }, { roles: ['owner', 'admin'], headers: () => ({ 'x-school-slug': st.tenantA.slug }) });
    await matrix('GET /organization/board-members (header = FOREIGN slug)', 'GET', '/organization/board-members', undefined, { roles: ['owner', 'admin'], headers: () => ({ 'x-school-slug': st.tenantB.slug }) });
    await matrix('GET /organization/board-members (header = OWN slug)', 'GET', '/organization/board-members', undefined, { roles: ['owner', 'admin'], headers: () => ({ 'x-school-slug': st.tenantA.slug }) });
    // ---------- web page smoke: Finance / Academics / Campus ----------
    await matrix('GET /finance/dashboard (finance page)', 'GET', '/finance/dashboard', undefined, { roles: ['owner', 'principal', 'admin', 'finance_manager'] });
    await matrix('GET /academics/dashboard (academics page)', 'GET', '/academics/dashboard', undefined, { roles: ['owner', 'principal', 'admin', 'teacher'] });
    await matrix('GET /organization/campuses (campus page)', 'GET', '/organization/campuses', undefined, { roles: ['owner', 'principal', 'admin'] });
    await matrix('GET /teaching/teachers (academics timetable)', 'GET', '/teaching/teachers', undefined, { roles: ['owner', 'principal', 'admin', 'teacher'] });

    // DB checks
    const sdoc = await db.collection('staff').findOne({ _id: new mongoose.Types.ObjectId(st.staff[2]) });
    extra.staff3_userId_unchanged = sdoc.userId === null; extra.staff3_tenant_unchanged = String(sdoc.tenantId) === st.tenantA.id; extra.staff3_designation = sdoc.designation;
    const victim = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(st.users.victim._id) });
    extra.victim_customRoleId_afterAssignTests = victim.customRoleId;
    const tb = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(st.users.teacher_b._id) });
    extra.tenantB_teacher_customRoleId = tb.customRoleId;
    extra.auditEntries = await db.collection('audit_logs').aggregate([{ $match: { schoolSlug: st.tenantA.slug, outcome: { $exists: true } } }, { $group: { _id: { module: '$module', action: '$action', outcome: '$outcome' }, n: { $sum: 1 } } }, { $sort: { '_id.module': 1, '_id.action': 1 } }]).toArray();
    const sample = await db.collection('audit_logs').findOne({ schoolSlug: st.tenantA.slug, action: 'Update payslip' });
    extra.auditSampleUpdatePayslip = sample ? { outcome: sample.outcome, hasOld: !!sample.oldValue, hasNew: !!sample.newValue, oldValue: String(sample.oldValue).slice(0, 160) } : null;
  }

  // ---------- print ----------
  const cols = ROLES;
  const md = [`### ${label}`, '', `| route | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  for (const [route, byRole] of Object.entries(results)) md.push(`| ${route} | ${cols.map((c) => byRole[c] ?? '').join(' | ')} |`);
  console.log(md.join('\n'));
  console.log('\nlogin statuses:', JSON.stringify(loginStatus));
  console.log('extra:', JSON.stringify(extra, null, 1));
  fs.writeFileSync(`.boot-result-${label}.json`, JSON.stringify({ results, extra, loginStatus }, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
