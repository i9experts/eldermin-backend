'use strict';
// Extended HR boot checks: lifecycle, recruitment, shifts, exit, letters,
// contracts writes + admin read views as each role, and My Leave with a teacher
// that has a staff row linked THROUGH THE APP'S OWN create-login flow.
// usage: node run-extended.js <label>   (app must be running; seed first)
const fs = require('fs');
const { requireLocalDb, STATE, mongoose } = require('./common');
const API = (process.env.BOOT_TEST_BASE || 'http://127.0.0.1:3917') + '/api/v1';
const label = process.argv[2] || 'ext';
const ROLES = ['hr_manager', 'admin', 'principal', 'owner', 'finance_manager', 'teacher', 'parent', 'student'];
const ALLOWED = new Set(['hr_manager', 'admin', 'principal', 'owner']);

async function http(method, path, token, body) {
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let json = null; try { json = JSON.parse(t); } catch { /* binary */ }
  return { status: res.status, json };
}

(async () => {
  requireLocalDb();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const tokens = {};
  for (const r of ROLES) tokens[r] = (await http('POST', '/auth/login', null, { email: st.users[r].email, password: st.password })).json?.accessToken;
  const results = {}; const ids = {}; const unexpected = [];
  const rec = (route, role, status) => { (results[route] ||= {})[role] = status; };
  // run a route for every role; allowed roles must be 2xx, others 403
  async function probe(route, method, pathFn, bodyFn, opts = {}) {
    for (const role of ROLES) {
      const path = typeof pathFn === 'function' ? pathFn(role) : pathFn;
      if (path === null) continue;
      const r = await http(method, path, tokens[role], typeof bodyFn === 'function' ? bodyFn(role) : bodyFn);
      rec(route, role, r.status);
      const ok = r.status >= 200 && r.status < 300;
      if (ALLOWED.has(role) && !ok && !(opts.okStatuses || []).includes(r.status)) unexpected.push(`${route} ${role} -> ${r.status} ${JSON.stringify(r.json)?.slice(0, 120)}`);
      if (!ALLOWED.has(role) && r.status !== 403) unexpected.push(`${route} ${role} -> ${r.status} (expected 403)`);
      if (ok && opts.keep && !ids[opts.keep]) ids[opts.keep] = r.json?._id || r.json?.id;
    }
  }
  const u = (role) => `${Date.now().toString(36)}${ROLES.indexOf(role)}`;

  // staff to attach exit/contract/appointment to
  const staffId = st.staff[1];
  await probe('POST /hr/lifecycle', 'POST', '/hr/lifecycle', (r) => ({ firstName: 'Cand', lastName: r, positionTitle: 'Teacher', email: `c.${u(r)}@x.test` }), { keep: 'cand' });
  await probe('PATCH /hr/lifecycle/:id/stage', 'PATCH', () => `/hr/lifecycle/${ids.cand}/stage`, { stage: 'interview', note: 'x' });
  await probe('GET /hr/lifecycle', 'GET', '/hr/lifecycle');
  await probe('POST /hr/recruitment/jobs', 'POST', '/hr/recruitment/jobs', (r) => ({ jobCode: `J-${u(r)}`, title: 'Math', department: 'Science' }), { keep: 'job' });
  await probe('PATCH /hr/recruitment/jobs/:id', 'PATCH', () => `/hr/recruitment/jobs/${ids.job}`, { title: 'Math 2' });
  await probe('POST /hr/recruitment/applications', 'POST', '/hr/recruitment/applications', (r) => ({ jobOpeningId: ids.job, jobId: ids.job, candidateName: `App ${r}`, firstName: 'App', lastName: r, email: `a.${u(r)}@x.test` }), { keep: 'app', okStatuses: [400] });
  await probe('GET /hr/recruitment/jobs', 'GET', '/hr/recruitment/jobs');
  await probe('GET /hr/recruitment/applications', 'GET', '/hr/recruitment/applications');
  await probe('POST /hr/shifts', 'POST', '/hr/shifts', (r) => ({ name: `Shift ${u(r)}`, startTime: '08:00', endTime: '14:00' }), { keep: 'shift' });
  await probe('PATCH /hr/shifts/:id', 'PATCH', () => `/hr/shifts/${ids.shift}`, { name: `Shift renamed ${Date.now()}` });
  await probe('POST /hr/exit', 'POST', '/hr/exit', (r) => ({ staffId: st.staff[ROLES.indexOf(r) % 5], exitType: 'resignation', resignationDate: '2026-12-01', lastWorkingDay: '2026-12-31' }), { keep: 'exit' });
  await probe('PATCH /hr/exit/:id', 'PATCH', () => `/hr/exit/${ids.exit}`, { notes: 'n' });
  await probe('GET /hr/exit', 'GET', '/hr/exit');
  await probe('GET /hr/grievances', 'GET', '/hr/grievances');
  await probe('GET /hr/performance', 'GET', '/hr/performance');
  await probe('GET /hr/leave/stats (admin leave view)', 'GET', '/hr/leave/stats');
  await probe('GET /hr/leave/balances (admin leave view)', 'GET', '/hr/leave/balances');
  await probe('POST /hr/offer-letter-templates', 'POST', '/hr/offer-letter-templates', (r) => ({ name: `OLT ${u(r)}`, body: 'Dear {{name}}' }), { keep: 'olt' });
  await probe('POST /hr/offer-letters', 'POST', '/hr/offer-letters', (r) => ({ candidateName: 'C', candidateEmail: 'c@x.test', designation: 'T', proposedSalary: 1, proposedJoiningDate: '2027-01-01', offerValidUntil: '2026-12-31' }), { keep: 'ol', okStatuses: [] });
  await probe('GET /hr/offer-letters', 'GET', '/hr/offer-letters');
  await probe('POST /hr/appointment-letters', 'POST', '/hr/appointment-letters', () => ({ staffId, designation: 'T', joiningDate: '2027-01-01', salary: 1 }), { keep: 'al' });
  await probe('GET /hr/appointment-letters', 'GET', '/hr/appointment-letters');
  await probe('POST /hr/contract-templates', 'POST', '/hr/contract-templates', (r) => ({ name: `CT ${u(r)}`, body: 'Contract body' }), { keep: 'ct' });
  await probe('POST /hr/contracts', 'POST', '/hr/contracts', () => ({ staffId, type: 'permanent', startDate: '2027-01-01' }), { keep: 'contract' });
  await probe('PATCH /hr/contracts/:id', 'PATCH', () => `/hr/contracts/${ids.contract}`, { notes: 'n' });
  await probe('GET /hr/contracts', 'GET', '/hr/contracts');

  // ---- My Leave with a teacher that has a REAL linked staff row (app's own create-login) ----
  const email = `leave.${Date.now().toString(36)}@${st.tenantA.slug}.test`;
  const mk = await http('POST', '/hr/staff', tokens.hr_manager, { firstName: 'Leave', lastName: 'Teacher', email, employeeId: `LV-${Date.now().toString(36)}`, department: 'Science', erpRole: 'teacher', designation: 'Teacher' });
  const sid = mk.json?._id;
  const cl = await http('POST', `/hr/staff/${sid}/create-login`, tokens.hr_manager, {});
  const lt = await http('POST', '/auth/login', null, { email, password: cl.json?.tempPassword });
  const leaveTok = lt.json?.accessToken;
  const leave = {
    createStaff: mk.status, createLogin: cl.status, login: lt.status,
    balance: (await http('GET', '/hr/leave/self/balance', leaveTok)).status,
    history: (await http('GET', '/hr/leave/self/history', leaveTok)).status,
    create: (await http('POST', '/hr/leave/self', leaveTok, { leaveType: 'casual', fromDate: '2026-11-02', toDate: '2026-11-03', reason: 'boot test' })).status,
    adminViewAsTeacher: (await http('GET', '/hr/leave/stats', leaveTok)).status,
    staffListAsTeacher: (await http('GET', '/hr/staff', leaveTok)).status,
    payslipsAsTeacher: (await http('GET', '/hr/payslips', leaveTok)).status,
  };
  {
    // Root cause check: this codebase (main) has the B0 id-typing problem - create-login stores staff.userId as an
    // ObjectId, getOwnStaffRecord filters by the JWT's STRING id on a Mixed path. Store it as a string and retry.
    const db = (await mongoose.connect(process.env.MONGODB_URI)).connection.db;
    const sdoc = await db.collection('staff').findOne({ _id: new mongoose.Types.ObjectId(sid) });
    leave.staffUserIdType = sdoc?.userId?.constructor?.name; leave.staffTenantIdType = typeof sdoc?.tenantId;
    await db.collection('staff').updateOne({ _id: sdoc._id }, { $set: { userId: String(sdoc.userId) } });
    leave.afterUserIdAsString = {
      balance: (await http('GET', '/hr/leave/self/balance', leaveTok)).status,
      history: (await http('GET', '/hr/leave/self/history', leaveTok)).status,
      create: (await http('POST', '/hr/leave/self', leaveTok, { leaveType: 'casual', fromDate: '2026-11-02', toDate: '2026-11-03', reason: 'boot test' })).status,
    };
    await mongoose.disconnect();
  }

  const cols = ROLES;
  const md = [`### ${label}`, '', `| route | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  for (const [route, by] of Object.entries(results)) md.push(`| ${route} | ${cols.map((c) => by[c] ?? '').join(' | ')} |`);
  console.log(md.join('\n')); console.log('\nMy Leave (teacher with app-created login + linked staff):', JSON.stringify(leave)); console.log('\nUNEXPECTED:', JSON.stringify(unexpected, null, 1));
  fs.writeFileSync(`.boot-ext-${label}.json`, JSON.stringify({ results, leave, unexpected }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
