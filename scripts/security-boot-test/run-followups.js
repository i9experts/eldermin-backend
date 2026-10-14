'use strict';
// fix/security-followups real-boot checks (D4, D7, D8, D9, D12, D15). LOCAL ONLY (see launch-app.js / common.js).
// Needs: seed.js run, app started with launch-app.js, then:  node run-followups.js <label>
// Logs in through the app's own /auth/login for every seeded user, then calls the changed routes and prints
// expected vs actual status codes. Exit code 1 when any check fails.
const fs = require('fs');
const path = require('path');
const { requireLocalDb, STATE, mongoose } = require('./common');
const API = (process.env.BOOT_TEST_BASE || 'http://127.0.0.1:3917') + '/api/v1';
const REPO = path.resolve(__dirname, '..', '..');
const label = process.argv[2] || 'followups';

async function http(method, p, token, body, raw) {
  const res = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let json = null; try { json = JSON.parse(t); } catch { /* binary */ }
  return { status: res.status, json, text: raw ? t : undefined };
}

(async () => {
  requireLocalDb();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const oid = (s) => new mongoose.Types.ObjectId(s);
  const slug = st.tenantA.slug;

  const tok = {};
  for (const [k, u] of Object.entries(st.users)) {
    const r = await http('POST', '/auth/login', null, { email: u.email, password: st.password });
    tok[k] = r.json?.accessToken;
  }
  const rows = []; let failed = 0;
  const row = (what, expected, actual, ok) => { rows.push({ what, expected, actual, ok }); if (!ok) failed++; };
  const is = (what, expected, r) => row(what, String(expected), String(r.status), Array.isArray(expected) ? expected.includes(r.status) : r.status === expected);
  const not403 = (what, r) => row(what, 'not 401/403/500', String(r.status), ![401, 403, 500].includes(r.status));

  // ---------------- D8 library ----------------
  const libWrites = [
    ['POST', '/academics/library/issue', {}], ['PUT', '/academics/library/settings', {}], ['POST', '/academics/library/books', {}],
    ['PATCH', `/academics/library/return/${new mongoose.Types.ObjectId()}`, {}], ['POST', `/academics/library/issues/${new mongoose.Types.ObjectId()}/renew`, {}],
    ['PATCH', `/academics/library/issues/${new mongoose.Types.ObjectId()}/fine-paid`, {}], ['POST', '/academics/library/reservations', {}],
    ['DELETE', `/academics/library/reservations/${new mongoose.Types.ObjectId()}`, undefined],
  ];
  for (const [m, p, b] of libWrites) {
    for (const role of ['parent', 'student']) is(`D8 ${role} ${m} ${p.replace(/[0-9a-f]{24}/, ':id')}`, 403, await http(m, p, tok[role], b));
    for (const role of ['teacher', 'admin']) not403(`D8 ${role} ${m} ${p.replace(/[0-9a-f]{24}/, ':id')} (not blocked; business error ok)`, await http(m, p, tok[role], b));
  }
  is('D8 parent GET /academics/library/settings', 403, await http('GET', '/academics/library/settings', tok.parent));
  is('D8 admin GET /academics/library/settings', 200, await http('GET', '/academics/library/settings', tok.admin));
  is('D8 teacher GET /academics/library/settings (kept)', 200, await http('GET', '/academics/library/settings', tok.teacher));
  is('D8 unchanged read: parent GET /academics/library/stats (not part of this approval)', [200, 403], await http('GET', '/academics/library/stats', tok.parent));

  // ---------------- D9 upload + ECE ----------------
  for (const role of ['parent', 'student']) {
    is(`D9 ${role} POST /upload/single/documents`, 403, await http('POST', '/upload/single/documents', tok[role], {}));
    is(`D9 ${role} DELETE /upload`, 403, await http('DELETE', '/upload', tok[role], { key: `${slug}/documents/x.pdf` }));
    is(`D9 ${role} GET /upload/signed-url`, 403, await http('GET', `/upload/signed-url?key=${encodeURIComponent(slug + '/documents/x.pdf')}`, tok[role]));
    is(`D9 ${role} GET /ece/frameworks`, 403, await http('GET', '/ece/frameworks', tok[role]));
    is(`D9 ${role} GET /ece/children`, 403, await http('GET', '/ece/children', tok[role]));
    is(`D9 ${role} POST /ece/observations`, 403, await http('POST', '/ece/observations', tok[role], {}));
  }
  // teacher: storage is not configured on this boot (no AWS vars) -> 503 from the service, NOT 403: access kept
  is('D9 teacher POST /upload/single/homework-attachments (access kept; storage not configured -> 503)', 503, await http('POST', '/upload/single/homework-attachments', tok.teacher, {}));
  is('D9 teacher POST /upload/single/a.b (bad folder -> 400)', 400, await http('POST', '/upload/single/a.b', tok.teacher, {}));
  is('D9 teacher DELETE /upload foreign-school key', 403, await http('DELETE', '/upload', tok.teacher, { key: 'some-other-school/documents/x.pdf' }));
  is('D9 teacher DELETE /upload key with traversal', 400, await http('DELETE', '/upload', tok.teacher, { key: `${slug}/../other/x.pdf` }));
  is('D9 teacher DELETE /upload no key', 400, await http('DELETE', '/upload', tok.teacher, {}));
  is('D9 teacher DELETE /upload own-school key (access kept; storage not configured -> 503)', 503, await http('DELETE', '/upload', tok.teacher, { key: `${slug}/homework-attachments/x.pdf` }));
  is('D9 teacher GET /upload/signed-url foreign key', 403, await http('GET', `/upload/signed-url?key=${encodeURIComponent('some-other-school/x/a.pdf')}`, tok.teacher));
  is('D9 teacher GET /upload/signed-url own key (503, storage not configured)', 503, await http('GET', `/upload/signed-url?key=${encodeURIComponent(slug + '/homework-attachments/x.pdf')}`, tok.teacher));
  is('D9 admin_b (other school) cannot use school A key', 403, await http('GET', `/upload/signed-url?key=${encodeURIComponent(slug + '/homework-attachments/x.pdf')}`, tok.admin_b));
  for (const role of ['teacher', 'admin', 'principal']) is(`D9 ${role} GET /ece/frameworks (kept)`, 200, await http('GET', '/ece/frameworks', tok[role]));

  // ---------------- D7 behaviour ----------------
  const rec = async (reportedById, title) => {
    const _id = new mongoose.Types.ObjectId();
    await db.collection('behaviour_records').insertOne({ _id, schoolSlug: slug, studentId: oid(st.student), studentName: 'Boot Student', title, type: 'negative', category: 'x', description: 'd', reportedBy: 'Seed', ...(reportedById ? { reportedById: oid(reportedById) } : {}), resolved: false, createdAt: new Date(), updatedAt: new Date() });
    return String(_id);
  };
  const mine = await rec(st.users.teacher._id, 'mine'), theirs = await rec(st.users.admin._id, 'theirs'), legacy = await rec(null, 'legacy');
  for (const role of ['parent', 'student']) is(`D7 ${role} PATCH records/:id/resolve`, 403, await http('PATCH', `/behaviour/records/${mine}/resolve`, tok[role], { note: 'x' }));
  for (const role of ['parent', 'student']) is(`D7 ${role} PUT records/:id`, 403, await http('PUT', `/behaviour/records/${mine}`, tok[role], { title: 'x' }));
  is('D7 teacher PUT own record', 200, await http('PUT', `/behaviour/records/${mine}`, tok.teacher, { title: 'edited', resolved: true, schoolSlug: 'evil', reportedById: st.users.admin._id }));
  { const d = await db.collection('behaviour_records').findOne({ _id: oid(mine) });
    row('D7 own-record edit applied; resolved/schoolSlug/reportedById NOT writable by a teacher', 'title=edited, resolved=false, slug kept, author kept', `title=${d.title}, resolved=${d.resolved}, slug ${d.schoolSlug === slug ? 'kept' : 'CHANGED'}, author ${String(d.reportedById) === st.users.teacher._id ? 'kept' : 'CHANGED'}`, d.title === 'edited' && d.resolved === false && d.schoolSlug === slug && String(d.reportedById) === st.users.teacher._id); }
  is("D7 teacher PUT another user's record", 403, await http('PUT', `/behaviour/records/${theirs}`, tok.teacher, { title: 'hijack' }));
  is('D7 teacher PUT legacy record (no author, fail closed)', 403, await http('PUT', `/behaviour/records/${legacy}`, tok.teacher, { title: 'x' }));
  { const d = await db.collection('behaviour_records').findOne({ _id: oid(theirs) }); row("D7 other record untouched after 403", 'title=theirs', `title=${d.title}`, d.title === 'theirs'); }
  is("D7 admin PUT another user's record (kept)", 200, await http('PUT', `/behaviour/records/${theirs}`, tok.admin, { title: 'admin-edit' }));
  is('D7 principal PUT legacy record (kept)', 200, await http('PUT', `/behaviour/records/${legacy}`, tok.principal, { title: 'p-edit' }));
  is('D7 teacher resolve (kept, web parity)', 200, await http('PATCH', `/behaviour/records/${theirs}/resolve`, tok.teacher, { note: 'handled' }));
  { const d = await db.collection('behaviour_records').findOne({ _id: oid(theirs) }); row('D7 resolve stamped', 'resolved=true, note', `resolved=${d.resolved}, note=${d.resolvedNote}`, d.resolved === true && d.resolvedNote === 'handled'); }
  const ghost = new mongoose.Types.ObjectId();
  is('D7 PUT unknown id -> 404', 404, await http('PUT', `/behaviour/records/${ghost}`, tok.admin, { title: 'x' }));
  is('D7 resolve unknown id -> 404', 404, await http('PATCH', `/behaviour/records/${ghost}/resolve`, tok.admin, { note: 'x' }));
  is('D7 PUT malformed id -> 400', 400, await http('PUT', '/behaviour/records/not-an-id', tok.admin, { title: 'x' }));
  is('D7 resolve malformed id -> 400', 400, await http('PATCH', '/behaviour/records/not-an-id/resolve', tok.admin, { note: 'x' }));
  is('D7 teacher POST records still works (authorship forced); campus rule unchanged', [201, 403], await http('POST', '/behaviour/records', tok.teacher, { studentId: st.student, studentName: 'Boot Student', grade: '5', title: 't', type: 'positive', category: 'good_conduct', description: 'd', date: new Date().toISOString() }));
  is('D7 teacher POST records with a bad category / missing grade -> 400 (was 500)', 400, await http('POST', '/behaviour/records', tok.teacher, { studentId: st.student, studentName: 'x', title: 't', type: 'positive', category: 'c', description: 'd', date: new Date().toISOString() }));
  is('D7 teacher POST records with malformed studentId -> 400 (was 500)', 400, await http('POST', '/behaviour/records', tok.teacher, { studentId: 'nope', date: new Date().toISOString() }));

  // ---------------- D12 syllabus ----------------
  const syl = async (teacherId) => { const _id = new mongoose.Types.ObjectId(); await db.collection('syllabi').insertOne({ _id, tenantId: st.tenantA.id, institutionId: st.tenantA.id, teacherId, gradeLevel: '5', subjectName: 'Sci', status: 'draft', units: [], createdAt: new Date(), updatedAt: new Date() }); return String(_id); };
  const mySyl = await syl(st.staff[0]);
  is('D12 teacher PUT own syllabus status=approved -> 403', 403, await http('PUT', `/syllabus/${mySyl}`, tok.teacher, { status: 'approved' }));
  { const d = await db.collection('syllabi').findOne({ _id: oid(mySyl) }); row('D12 syllabus still draft after the 403', 'draft', d.status, d.status === 'draft'); }
  is('D12 teacher PUT own syllabus status=active (kept)', 200, await http('PUT', `/syllabus/${mySyl}`, tok.teacher, { status: 'active', description: 'd' }));
  { // CreateSyllabusDto has no `status`, so the validation pipe strips it: a teacher-created syllabus can never be 'approved' (the service guard is defence in depth)
    const c = await http('POST', '/syllabus', tok.teacher, { gradeLevel: '5', subjectName: 'Sci', academicYearLabel: '2026-27', term: 'Term 1', status: 'approved', units: [] });
    row('D12 teacher POST syllabus with status=approved never ends up approved', '403, or created as draft', `${c.status} status=${c.json?.status}`, c.status === 403 || (c.status === 201 && c.json?.status !== 'approved')); }
  is('D12 admin PUT status=approved (kept)', 200, await http('PUT', `/syllabus/${mySyl}`, tok.admin, { status: 'approved' }));
  is('D12 admin PATCH :id/approve (kept)', 200, await http('PATCH', `/syllabus/${await syl(st.staff[0])}/approve`, tok.admin, { approverName: 'Admin' }));
  is('D12 teacher PATCH :id/approve still 403', 403, await http('PATCH', `/syllabus/${mySyl}/approve`, tok.teacher, { approverName: 'me' }));
  is("D12 teacher cannot PUT another teacher's syllabus (#160 intact)", 403, await http('PUT', `/syllabus/${await syl(st.staff[1])}`, tok.teacher, { description: 'x' }));

  // ---------------- D15 payroll ----------------
  const run1 = await http('POST', '/hr/payroll/runs', tok.admin, { month: 7, year: 2043 });
  is('D15 first payroll run for a month -> 201', 201, run1);
  const run2 = await http('POST', '/hr/payroll/runs', tok.admin, { month: 7, year: 2043 });
  is('D15 duplicate payroll run -> 409', 409, run2);
  row('D15 409 message names the period', 'contains July 2043', String(run2.json?.message), /July 2043/.test(String(run2.json?.message)));
  const staffId = st.staff[1];
  is('D15 payslip without payrollRunId -> 400', 400, await http('POST', '/hr/payslips', tok.admin, { staffId, month: 7, year: 2043, basicSalary: 1, grossSalary: 1 }));
  is('D15 payslip with malformed payrollRunId -> 400', 400, await http('POST', '/hr/payslips', tok.admin, { staffId, payrollRunId: 'nope', month: 7, year: 2043, basicSalary: 1, grossSalary: 1 }));
  const runId = run1.json?._id || run1.json?.id;
  const p1 = await http('POST', '/hr/payslips', tok.admin, { staffId, payrollRunId: runId, month: 7, year: 2043, basicSalary: 100, grossSalary: 100, staffName: 'Boot' });
  is('D15 valid payslip -> 201', 201, p1);
  is('D15 duplicate payslip same staff+month -> 409', 409, await http('POST', '/hr/payslips', tok.admin, { staffId, payrollRunId: runId, month: 7, year: 2043, basicSalary: 100, grossSalary: 100, staffName: 'Boot' }));
  is('D15 teacher still cannot create a payroll run (S2a intact)', 403, await http('POST', '/hr/payroll/runs', tok.teacher, { month: 8, year: 2043 }));

  // ---------------- D4 base-role change (real service, real Mongo) ----------------
  const dist = (p_) => require(path.join(REPO, 'dist', p_));
  const { AccountAccessService } = dist('modules/auth/account-access.service.js');
  const { CriticalAuditService } = dist('common/critical-audit.service.js');
  const { UserSchema } = dist('modules/organization/schemas/user.schema.js');
  const { TenantSchema } = dist('modules/organization/schemas/tenant.schema.js');
  const { AuditLogSchema } = dist('compliance/schemas/compliance.schema.js');
  const M = (n, s_) => mongoose.models[n] || mongoose.model(n, s_);
  const audit = new CriticalAuditService(M('AuditLog', AuditLogSchema));
  const access = new AccountAccessService(M('User', UserSchema), M('Tenant', TenantSchema), M('AuditLog', AuditLogSchema), audit, { invalidate() {} });
  const vic = st.users.victim;
  const pre = await http('GET', '/hr/holidays', tok.victim);
  row('D4 before the change the victim token works', '200', String(pre.status), pre.status === 200);
  const out = await access.changeBaseRole(vic._id, 'academic_coordinator', 'boot test promotion', st.users.admin._id, { name: 'Admin', schoolSlug: slug });
  row('D4 changeBaseRole(teacher -> academic_coordinator)', 'changed', out.outcome, out.outcome === 'changed');
  const u = await db.collection('users').findOne({ _id: oid(vic._id) });
  row('D4 role stored + tokenVersion bumped', 'academic_coordinator, tv=1', `${u.primaryRole}, tv=${u.tokenVersion}`, u.primaryRole === 'academic_coordinator' && u.tokenVersion === 1);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // the app caches account state per instance (AUTH_STATE_CACHE_TTL_MS; start the app with 1000 for a fast run); a rejection is re-confirmed against the DB
  let lastStatus = 0;
  for (let i2 = 0; i2 < 45; i2++) { const r = await http('GET', '/hr/holidays', tok.victim); lastStatus = r.status; if (r.status === 401) break; await wait(1000); }
  row('D4 the OLD token (old role) is rejected after the bump', '401', String(lastStatus), lastStatus === 401);
  const relog = await http('POST', '/auth/login', null, { email: vic.email, password: st.password });
  row('D4 fresh login carries the new role', 'academic_coordinator', String(relog.json?.user?.role), relog.json?.user?.role === 'academic_coordinator');
  row('D4 audit row written', '1 Change base role row', String(await db.collection('audit_logs').countDocuments({ resourceId: vic._id, action: 'Change base role' })), (await db.collection('audit_logs').countDocuments({ resourceId: vic._id, action: 'Change base role' })) === 1);
  { const x = await access.changeBaseRole(st.users.admin._id, 'institution_owner', 'x', 'a'); row('D4 change TO institution_owner refused', 'protected', x.outcome, x.outcome === 'protected'); }
  const ow = await access.changeBaseRole(st.users.owner._id, 'teacher', 'x', 'a'); row('D4 owner account never changed', 'protected', ow.outcome, ow.outcome === 'protected');
  const pa = await access.changeBaseRole(st.users.parent._id, 'teacher', 'x', 'a'); row('D4 parent account never changed', 'not_staff', pa.outcome, pa.outcome === 'not_staff');

  // ---------------- report ----------------
  const pad = (s, n) => String(s).slice(0, n).padEnd(n);
  console.log(`| check | expected | actual | ok |\n|---|---|---|---|`);
  for (const r of rows) console.log(`| ${r.what} | ${r.expected} | ${r.actual} | ${r.ok ? 'yes' : 'NO'} |`);
  console.log(`\nTOTAL ${rows.length}, FAILED ${failed}`);
  if (failed) console.log('FAILED: ' + JSON.stringify(rows.filter((r) => !r.ok), null, 1));
  console.log(JSON.stringify({ label, total: rows.length, failed }));
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
