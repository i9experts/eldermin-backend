'use strict';
// S3 (token revocation) + S1/S2a follow-up real-boot checks. LOCAL ONLY (see launch-app.js).
// usage: node run-s3.js <label> <mode>
//   mode "main"    app started with AUTH_STATE_CACHE_TTL_MS=1000 and JWT_SECRET=<S3_SECRET>   (fast suite)
//   mode "default" app started with the DEFAULT 30 s TTL (stale-window measurement)
//   mode "off"     app started with AUTH_STATE_CHECK=off (kill switch)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require(path.resolve(__dirname, '..', '..', 'node_modules', 'jsonwebtoken'));
const { requireLocalDb, STATE, mongoose } = require('./common');
const API = (process.env.BOOT_TEST_BASE || 'http://127.0.0.1:3917') + '/api/v1';
const label = process.argv[2] || 's3';
const mode = process.argv[3] || 'main';
const SECRET = process.env.S3_SECRET || 'boot-s3-throwaway-secret';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

async function http(method, p, token, body) {
  const res = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let json = null; try { json = JSON.parse(t); } catch { /* */ }
  return { status: res.status, json };
}

(async () => {
  requireLocalDb();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  st.extraCleanup = st.extraCleanup || [];
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const O = (x) => new mongoose.Types.ObjectId(x);
  const login = (email, password) => http('POST', '/auth/login', null, { email, password });
  const tok = {};
  for (const r of ['hr_manager', 'owner', 'teacher', 'admin_b']) tok[r] = (await login(st.users[r].email, st.password)).json?.accessToken;
  const R = []; const row = (area, step, expected, actual, ok) => R.push({ area, step, expected, actual, ok });
  const stamp = Date.now().toString(36);
  async function mkStaff(tag, extra = {}) {
    const email = `${tag}.${stamp}@${st.tenantA.slug}.test`;
    const s = await http('POST', '/hr/staff', tok.hr_manager, { firstName: tag, lastName: 'S3', email, employeeId: `S3-${tag}-${stamp}`, department: 'Science', designation: 'Teacher', erpRole: 'teacher', ...extra });
    const cl = await http('POST', `/hr/staff/${s.json?._id}/create-login`, tok.hr_manager, {});
    const lg = await login(email, cl.json?.tempPassword);
    const userId = String((await db.collection('users').findOne({ email }))._id);
    return { staffId: s.json?._id, email, password: cl.json?.tempPassword, userId, token: lg.json?.accessToken, tv: lg.json?.accessToken ? decode(lg.json.accessToken).tv : undefined };
  }
  // /hr/holidays: reachable by any staff role, touches no per-user data, so a 401 here can only come from the JWT
  // strategy's state check (GET /auth/me would ALSO 401 on its own isActive check and hide a broken strategy).
  const PROBE = '/hr/holidays';
  const probe = async (t, p = PROBE) => (await http('GET', p, t)).status;
  const waitFor401 = async (t, maxMs) => { const t0 = Date.now(); while (Date.now() - t0 <= maxMs) { if ((await probe(t)) === 401) return Date.now() - t0; await sleep(100); } return -1; };

  if (mode === 'default') {
    // ---- stale window with the DEFAULT 30 s TTL: bump written straight to the DB (= "another instance") ----
    const a = await mkStaff('s3stale');
    const before = await probe(a.token);
    await db.collection('users').updateOne({ _id: O(a.userId) }, { $inc: { tokenVersion: 1 } });   // not through this instance: its cache is not invalidated
    const delay = await waitFor401(a.token, 45000);
    row('default TTL (30 s)', 'token valid before the bump', '200', before, before === 200);
    row('default TTL (30 s)', 'bump done "elsewhere" (direct DB write): time until the old token gets 401', '<= 30000 ms (and > 0)', `${delay} ms`, delay > 0 && delay <= 31000);
    const b = await mkStaff('s3same'); await probe(b.token);
    const t0 = Date.now(); const d = await http('DELETE', `/hr/staff/${b.staffId}`, tok.hr_manager); const same = await probe(b.token);
    row('default TTL (30 s)', 'deactivation THROUGH this instance: explicit invalidation', '401 at once', `${d.status} then ${same} after ${Date.now() - t0} ms`, same === 401);
  } else if (mode === 'off') {
    const a = await mkStaff('s3off');
    await http('DELETE', `/hr/staff/${a.staffId}`, tok.hr_manager);
    await sleep(1500);
    const still = await probe(a.token);
    row('kill switch AUTH_STATE_CHECK=off', 'deactivated user\'s existing token', '200 (check skipped, pre-S3 behaviour)', still, still === 200);
    const lg = await login(a.email, a.password);
    row('kill switch AUTH_STATE_CHECK=off', 'login of the deactivated user is still refused (S1 is independent)', '401', lg.status, lg.status === 401);
  } else {
    // ---------- tv claim + pre-S3 token ----------
    const u = await mkStaff('s3base');
    row('issuance', 'new login token carries tv', 'tv = 0', `tv=${u.tv}`, u.tv === 0);
    const preS3 = jwt.sign({ sub: u.userId, tenantId: st.tenantA.id, institutionId: st.tenantA.id, role: 'teacher', name: 'x', schoolSlug: st.tenantA.slug, activeModules: ['organization'] }, SECRET, { expiresIn: '1h' });
    const r1 = await probe(preS3), r2 = await http('GET', '/auth/me', preS3);
    row('pre-S3 token (no tv claim)', 'still works (treated as tv 0)', '200 on /hr/holidays and /auth/me', `${r1} and ${r2.status}`, r1 === 200 && r2.status === 200);

    // ---------- deactivation ----------
    const d1 = await mkStaff('s3deact'); const pre = await probe(d1.token);
    const t0 = Date.now(); await http('DELETE', `/hr/staff/${d1.staffId}`, tok.hr_manager); const delay = await waitFor401(d1.token, 5000);
    row('deactivation', 'existing token before / after DELETE staff', '200 -> 401', `${pre} -> 401 after ${delay} ms`, pre === 200 && delay >= 0);
    const m = await http('GET', PROBE, d1.token);
    row('deactivation', 'message', 'This account is no longer active.', m.json?.message, m.json?.message === 'This account is no longer active.');
    const udoc = await db.collection('users').findOne({ _id: O(d1.userId) });
    row('deactivation', 'User.tokenVersion bumped', '1', udoc.tokenVersion, udoc.tokenVersion === 1);

    // ---------- password reset kills old tokens ----------
    const p1 = await mkStaff('s3hrreset'); const p1pre = await probe(p1.token);
    const rs = await http('POST', `/hr/staff/${p1.staffId}/reset-password`, tok.hr_manager, {});
    const p1post = await probe(p1.token); const nl = await login(p1.email, rs.json?.tempPassword);
    row('HR reset-password', 'old token / new login', '200 -> 401; new login 200 with tv 1', `${p1pre} -> ${p1post}; ${nl.status} tv=${nl.json?.accessToken ? decode(nl.json.accessToken).tv : '-'}`, p1pre === 200 && p1post === 401 && nl.status === 200 && decode(nl.json.accessToken).tv === 1);
    const p2 = await mkStaff('s3selfreset'); const p2pre = await probe(p2.token);
    const raw = crypto.randomBytes(8).toString('hex'); await db.collection('users').updateOne({ _id: O(p2.userId) }, { $set: { resetPasswordTokenHash: crypto.createHash('sha256').update(raw).digest('hex'), resetPasswordExpires: new Date(Date.now() + 3600e3) } });
    const sr = await http('POST', '/auth/reset-password', null, { token: raw, newPassword: 'NewPass#12345' });
    const p2post = await probe(p2.token); const nl2 = await login(p2.email, 'NewPass#12345');
    row('self reset-password (emailed link)', 'old token / new login with the new password', '200 -> 401; 200', `${p2pre} -> ${p2post}; ${nl2.status} (reset ${sr.status})`, p2pre === 200 && p2post === 401 && nl2.status === 200);
    row('password change', 'no change-password endpoint exists in this codebase', 'n/a (reset is the only password change path)', 'n/a', true);

    // ---------- demotion of a shared account ----------
    const sh = await mkStaff('s3shared');
    await db.collection('users').updateOne({ _id: O(sh.userId) }, { $set: { guardianOfStudentIds: [O(st.student)] } });
    const shPre = await http('GET', '/hr/staff', sh.token);
    await http('DELETE', `/hr/staff/${sh.staffId}`, tok.hr_manager);
    const oldStaffRoute = await http('GET', '/hr/staff', sh.token); const oldPortal = await http('GET', '/parent-portal/my-students', sh.token);
    row('demotion (shared staff+guardian account)', 'OLD token: staff route / parent-portal', '200 before; 401 / 401 after (whole token revoked)', `${shPre.status}; ${oldStaffRoute.status} / ${oldPortal.status}`, shPre.status === 200 && oldStaffRoute.status === 401 && oldPortal.status === 401);
    const nl3 = await login(sh.email, sh.password); const np = await http('GET', '/parent-portal/my-students', nl3.json?.accessToken); const ns = await http('GET', '/hr/staff', nl3.json?.accessToken);
    row('demotion', 'NEW login: role / parent-portal / staff route', 'parent / 200 / 403', `${nl3.json?.user?.role} / ${np.status} / ${ns.status}`, nl3.json?.user?.role === 'parent' && np.status === 200 && ns.status === 403);

    // ---------- admin sign out everywhere ----------
    const so = await mkStaff('s3signout'); const soPre = await probe(so.token);
    const tSign = await http('POST', `/hr/staff/${so.staffId}/sign-out`, tok.teacher); const xt = await http('POST', `/hr/staff/${so.staffId}/sign-out`, tok.admin_b);
    const stillOk = await probe(so.token);
    row('sign out everywhere (admin)', 'teacher caller / other-tenant admin / token unaffected', '403 / 403-or-404 / 200', `${tSign.status} / ${xt.status} / ${stillOk}`, tSign.status === 403 && [403, 404].includes(xt.status) && stillOk === 200);
    const sg = await http('POST', `/hr/staff/${so.staffId}/sign-out`, tok.hr_manager); const soPost = await probe(so.token); const soNew = await login(so.email, so.password);
    row('sign out everywhere (admin)', 'HR admin signs the user out: old token / new login', '2xx; 401; 200', `${sg.status}; ${soPost}; ${soNew.status}`, sg.status < 300 && soPre === 200 && soPost === 401 && soNew.status === 200);
    const aud = await db.collection('audit_logs').findOne({ schoolSlug: st.tenantA.slug, action: 'Sign out everywhere' });
    row('sign out everywhere (admin)', 'audit entry', 'present with actor', aud ? `by=${!!aud.performedBy}` : 'missing', !!aud && !!aud.performedBy);
    const self = await mkStaff('s3selfout'); const selfPre = await probe(self.token); const lo = await http('POST', '/auth/logout-all', self.token); const selfPost = await probe(self.token);
    row('sign out everywhere (self)', 'POST /auth/logout-all', '200; old token 401', `${lo.status}; ${selfPre} -> ${selfPost}`, lo.status === 200 && selfPost === 401);

    // ---------- parent-portal token ----------
    const pemail = `par.${stamp}@${st.tenantA.slug}.test`; const pid = new mongoose.Types.ObjectId();
    await db.collection('users').insertOne({ _id: pid, tenantId: st.tenantA.id, institutionId: st.tenantA.id, email: pemail, passwordHash: await bcrypt.hash('Parent#12345', 4), primaryRole: 'parent', isActive: true, profile: { firstName: 'P', lastName: 'S3' }, guardianOfStudentIds: [O(st.student)], customRoleId: null, createdAt: new Date(), updatedAt: new Date() });
    const pl = await login(pemail, 'Parent#12345'); const pt = pl.json?.accessToken;
    const pOk = await http('GET', '/parent-portal/my-students', pt);
    await db.collection('users').updateOne({ _id: pid }, { $inc: { tokenVersion: 1 } });
    const pBump = await http('GET', '/parent-portal/my-students', pt);
    row('parent-portal token', 'version bumped: parent-portal route (interceptor, own fresh read)', '200 -> 401 immediately', `${pOk.status} -> ${pBump.status} "${pBump.json?.message}"`, pOk.status === 200 && pBump.status === 401);
    const pl2 = await login(pemail, 'Parent#12345'); const pt2 = pl2.json?.accessToken;
    await db.collection('users').updateOne({ _id: pid }, { $set: { isActive: false } });
    const pDead = await http('GET', '/parent-portal/my-students', pt2);
    row('parent-portal token', 'guardian deactivated: parent-portal route', '401 "This account is no longer active."', `${pDead.status} "${pDead.json?.message}"`, pDead.status === 401 && /no longer active/.test(pDead.json?.message || ''));
    await db.collection('users').updateOne({ _id: pid }, { $set: { isActive: true } });
    const pl3 = await login(pemail, 'Parent#12345'); const pt3 = pl3.json?.accessToken; const p3a = await probe(pt3, '/auth/me');
    await db.collection('users').updateOne({ _id: pid }, { $inc: { tokenVersion: 1 } }); await sleep(1300);
    const p3b = await probe(pt3, '/auth/me');
    row('parent token on a NON-portal route (strategy only: user stays active)', 'version bumped elsewhere, after the 1 s test TTL', '200 -> 401', `${p3a} -> ${p3b}`, p3a === 200 && p3b === 401);

    // ---------- follow-ups 1..4 ----------
    const lv = await mkStaff('s3leave');
    const lvr = { balance: (await http('GET', '/hr/leave/self/balance', lv.token)).status, history: (await http('GET', '/hr/leave/self/history', lv.token)).status, apply: (await http('POST', '/hr/leave/self', lv.token, { leaveType: 'casual', fromDate: '2026-11-02', toDate: '2026-11-03', reason: 'boot test' })).status };
    const stf = await db.collection('staff').findOne({ _id: O(lv.staffId) });
    row('follow-up 1: My Leave (teacher with app-created login, staff.userId stored as ' + (stf.userId?.constructor?.name) + ')', 'balance / history / apply', '2xx x3', `${lvr.balance} / ${lvr.history} / ${lvr.apply}`, lvr.balance === 200 && lvr.history === 200 && lvr.apply < 300);
    await db.collection('tenants').updateOne({ _id: O(st.tenantA.id) }, { $set: { status: 'suspended' } });
    const ow = await login(st.users.owner.email, st.password); const owWrong = await login(st.users.owner.email, 'wrong-password');
    const meSusp = await http('GET', '/auth/me', tok.owner);
    const phone = '+92300' + String(Math.floor(1000000 + Math.random() * 8999999)); const norm = phone.replace(/[^\d+]/g, '');
    await db.collection('students').updateOne({ _id: O(st.student) }, { $set: { guardians: [{ name: 'G', phone, email: `g.${stamp}@x.test` }] } });
    st.extraCleanup.push({ collection: 'phone_otps', filter: { phone: norm } });
    const rq = await http('POST', '/parent-portal/auth/request-otp', null, { phone });
    await db.collection('phone_otps').insertOne({ phone: norm, codeHash: await bcrypt.hash('123456', 4), expiresAt: new Date(Date.now() + 600e3), attempts: 0, consumedAt: null, createdAt: new Date(), updatedAt: new Date() });
    const vf = await http('POST', '/parent-portal/auth/verify-otp', null, { phone, code: '123456' });
    const MSG = "This school's account is suspended — please contact your school";
    row('follow-up 2: suspended school (pending owner confirmation)', 'login with valid credentials', `403 "${MSG}"`, `${ow.status} "${ow.json?.message}"`, ow.status === 403 && ow.json?.message === MSG);
    row('follow-up 2: suspended school', 'login with WRONG password (must stay generic)', '401 Invalid credentials', `${owWrong.status} "${owWrong.json?.message}"`, owWrong.status === 401 && owWrong.json?.message === 'Invalid credentials');
    row('follow-up 2: suspended school', 'token+slug login (/auth/me with an existing token)', `403 "${MSG}"`, `${meSusp.status} "${meSusp.json?.message}"`, meSusp.status === 403 && meSusp.json?.message === MSG);
    row('follow-up 2: suspended school', 'parent OTP request / verify', `403 / 403 with the message, no token`, `${rq.status} / ${vf.status} token=${!!vf.json?.accessToken} "${vf.json?.message}"`, rq.status === 403 && vf.status === 403 && !vf.json?.accessToken && vf.json?.message === MSG);
    await db.collection('tenants').updateOne({ _id: O(st.tenantA.id) }, { $set: { status: 'active' } });
    await db.collection('students').updateOne({ _id: O(st.student) }, { $set: { guardians: [] } });
    const back = await login(st.users.owner.email, st.password);
    row('follow-up 2: suspended school', 'lifted', 'login 200', back.status, back.status === 200);

    const exStaff = await mkStaff('s3exit');
    const ex1 = await http('POST', '/hr/exit', tok.hr_manager, { staffId: exStaff.staffId, exitType: 'resignation', resignationDate: '2026-12-01', lastWorkingDay: '2099-01-01' });
    const ex2 = await http('POST', '/hr/exit', tok.hr_manager, { staffId: exStaff.staffId, exitType: 'resignation', resignationDate: '2026-12-01', lastWorkingDay: '2099-01-01' });
    row('follow-up 4: duplicate exit record', 'second POST /hr/exit for the same staff', '201 then 409 with a clear message', `${ex1.status} then ${ex2.status} "${ex2.json?.message}"`, ex1.status === 201 && ex2.status === 409 && /already exists/.test(ex2.json?.message || ''));

    const rv = await mkStaff('s3reviv'); await http('DELETE', `/hr/staff/${rv.staffId}`, tok.hr_manager);
    const dead = await login(rv.email, rv.password);
    const back2 = await http('PATCH', `/hr/staff/${rv.staffId}`, tok.hr_manager, { status: 'active' });
    const alive = await login(rv.email, rv.password);
    const audRe = await db.collection('audit_logs').find({ schoolSlug: st.tenantA.slug, action: 'Reactivate login', resourceId: rv.userId }).toArray();
    row('follow-up 3: status dropdown -> Active (only {status:"active"} is sent)', 'login before / after; audit entry', '401 -> 200; audit applied with actor + reason + before/after', `${dead.status} -> ${alive.status}; patch ${back2.status}; audit=${JSON.stringify(audRe.map((a) => ({ outcome: a.outcome, by: !!a.performedById, reason: /status set to active/.test(a.newValue || ''), before: /isActive/.test(a.oldValue || '') })))}`, dead.status === 401 && alive.status === 200 && audRe.length === 1 && audRe[0].outcome === 'applied' && !!audRe[0].performedById);
  }

  const bad = R.filter((r) => !r.ok);
  const md = ['| area | step | expected | actual | ok |', '|---|---|---|---|---|', ...R.map((r) => `| ${r.area} | ${r.step} | ${String(r.expected).replace(/\|/g, '/')} | ${String(r.actual).replace(/\|/g, '/')} | ${r.ok ? 'yes' : '**NO**'} |`)];
  console.log(md.join('\n')); console.log(`\nTOTAL ${R.length}, FAILED ${bad.length}`);
  if (bad.length) console.log('FAILED:', JSON.stringify(bad, null, 1));
  fs.writeFileSync(`.boot-s3-${label}.md`, md.join('\n'));
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
