'use strict';
// fix/security-followups ROUND 2 real-boot checks: counselling/interventions, Tarbiyah ownership, library reads + borrower tenant,
// Early Years scope + settings, the approval routes. LOCAL ONLY (see launch-app.js / common.js).
// Needs: seed.js run, app started with launch-app.js, then:  node run-followups2.js <label>
// Prints expected vs actual status codes and the DB state where it matters. Exit code 1 when any check fails.
const fs = require('fs');
const { requireLocalDb, STATE, mongoose } = require('./common');
const API = (process.env.BOOT_TEST_BASE || 'http://127.0.0.1:3917') + '/api/v1';
const label = process.argv[2] || 'followups2';

async function http(method, p, token, body) {
  const res = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let json = null; try { json = JSON.parse(t); } catch { /* binary */ }
  return { status: res.status, json };
}

(async () => {
  requireLocalDb();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const O = (s) => new mongoose.Types.ObjectId(s);
  const slug = st.tenantA.slug, tenantA = st.tenantA.id, tenantB = st.tenantB.id;
  const tok = {}, name = {};
  for (const [k, u] of Object.entries(st.users)) {
    const r = await http('POST', '/auth/login', null, { email: u.email, password: st.password });
    tok[k] = r.json?.accessToken; name[k] = r.json?.user?.name;
  }
  const uid = (k) => st.users[k]._id;
  const rows = []; let failed = 0;
  const row = (what, expected, actual, ok) => { rows.push({ what, expected, actual, ok }); if (!ok) failed++; };
  const is = (what, expected, r) => row(what, String(expected), String(r.status), Array.isArray(expected) ? expected.includes(r.status) : r.status === expected);
  const notDenied = (what, r) => row(what, 'not 401/403', String(r.status), ![401, 403].includes(r.status));
  const campus = await db.collection('campuses').findOne({ tenantId: tenantA });
  const campusId = String(campus._id);
  const student = st.student;

  // ============================ counselling + interventions ============================
  const counsel = new mongoose.Types.ObjectId(), interv = new mongoose.Types.ObjectId();
  await db.collection('counselling_sessions').insertOne({ _id: counsel, schoolSlug: slug, studentId: O(student), studentName: 'Boot Student', grade: '5', sessionDate: new Date(), referredBy: 'x', type: 'academic', status: 'scheduled', counsellor: 'C', createdAt: new Date(), updatedAt: new Date() });
  await db.collection('interventions').insertOne({ _id: interv, schoolSlug: slug, studentId: O(student), studentName: 'Boot Student', grade: '5', title: 't', concern: 'c', startDate: new Date(), status: 'active', createdBy: 'x', createdAt: new Date(), updatedAt: new Date() });
  const confidential = [
    ['GET', '/behaviour/counselling'], ['POST', '/behaviour/counselling', {}], ['PUT', `/behaviour/counselling/${counsel}`, { notes: 'x' }], ['PATCH', `/behaviour/counselling/${counsel}/complete`, {}],
    ['GET', '/behaviour/interventions'], ['POST', '/behaviour/interventions', {}], ['PUT', `/behaviour/interventions/${interv}`, { concern: 'x' }],
    ['POST', `/behaviour/interventions/${interv}/progress`, { note: 'n' }], ['PATCH', `/behaviour/interventions/${interv}/action/${new mongoose.Types.ObjectId()}`, { status: 'done' }],
  ];
  const tag = (m, p) => `${m} ${p.replace(/[0-9a-f]{24}/g, ':id')}`;
  for (const [m, p, b] of confidential) {
    for (const role of ['teacher', 'parent', 'student', 'finance_manager']) is(`R2 ${role} ${tag(m, p)} -> 403`, 403, await http(m, p, tok[role], b));
  }
  is('R2 principal GET counselling (kept)', 200, await http('GET', '/behaviour/counselling', tok.principal));
  is('R2 admin GET interventions (kept)', 200, await http('GET', '/behaviour/interventions', tok.admin));
  is('R2 owner PUT counselling (kept)', 200, await http('PUT', `/behaviour/counselling/${counsel}`, tok.owner, { notes: 'ok' }));
  is('R2 admin PUT intervention (kept)', 200, await http('PUT', `/behaviour/interventions/${interv}`, tok.admin, { concern: 'ok' }));
  // custom roles on a teacher login (victim): the guard reads the role live from the DB
  const setRole = async (access) => {
    const roleId = new mongoose.Types.ObjectId();
    await db.collection('roles').insertOne({ _id: roleId, schoolSlug: slug, name: `R2-${roleId}`, moduleAccess: access, isSystemDefault: false, createdAt: new Date(), updatedAt: new Date() });
    await db.collection('users').updateOne({ _id: O(uid('victim')) }, { $set: { customRoleId: roleId } });
  };
  await setRole([{ moduleKey: 'behaviour', level: 'manage', subModuleKey: null }]);
  is('R2 the stock module-wide behaviour:manage custom role -> counselling GET still 403', 403, await http('GET', '/behaviour/counselling', tok.victim));
  await setRole([{ moduleKey: 'behaviour', subModuleKey: 'records', level: 'manage' }]);
  is('R2 behaviour:records:manage -> counselling GET 403 (a sibling sub-module does not count)', 403, await http('GET', '/behaviour/counselling', tok.victim));
  await setRole([{ moduleKey: 'behaviour', subModuleKey: 'counselling', level: 'view' }]);
  is('R2 behaviour:counselling:view -> counselling GET 200', 200, await http('GET', '/behaviour/counselling', tok.victim));
  is('R2 behaviour:counselling:view -> counselling PUT 403 (view is not manage)', 403, await http('PUT', `/behaviour/counselling/${counsel}`, tok.victim, { notes: 'x' }));
  is('R2 behaviour:counselling:view -> interventions GET 403', 403, await http('GET', '/behaviour/interventions', tok.victim));
  await setRole([{ moduleKey: 'behaviour', subModuleKey: 'counselling', level: 'manage' }]);
  is('R2 behaviour:counselling:manage -> counselling PUT 200', 200, await http('PUT', `/behaviour/counselling/${counsel}`, tok.victim, { notes: 'by custom role' }));
  await db.collection('users').updateOne({ _id: O(uid('victim')) }, { $set: { customRoleId: null } });

  // ============================ Tarbiyah ownership ============================
  let tarN = 0;
  const tar = async (by) => { const _id = new mongoose.Types.ObjectId(); await db.collection('tarbiyah_assessments').insertOne({ _id, schoolSlug: slug, studentId: O(student), studentName: 'Boot Student', grade: '5', period: `T${++tarN}`, periodType: 'termly', assessmentDate: new Date(), traits: [], assessedBy: 'x', ...(by ? { assessedById: O(by) } : {}), parentShared: false, academicYear: '2025-26', createdAt: new Date(), updatedAt: new Date() }); return String(_id); };
  const tMine = await tar(uid('teacher')), tTheirs = await tar(uid('admin')), tLegacy = await tar(null);
  is('R2 teacher PUT own Tarbiyah (author)', 200, await http('PUT', `/behaviour/tarbiyah/${tMine}`, tok.teacher, { teacherObservations: 'mine', assessedById: uid('admin'), schoolSlug: 'evil', parentShared: true }));
  { const d = await db.collection('tarbiyah_assessments').findOne({ _id: O(tMine) });
    row('R2 own edit applied; author and school NOT writable by a teacher; parent-share toggle works', 'obs=mine, author kept, slug kept, parentShared=true', `obs=${d.teacherObservations}, author ${String(d.assessedById) === uid('teacher') ? 'kept' : 'CHANGED'}, slug ${d.schoolSlug === slug ? 'kept' : 'CHANGED'}, parentShared=${d.parentShared}`, d.teacherObservations === 'mine' && String(d.assessedById) === uid('teacher') && d.schoolSlug === slug && d.parentShared === true); }
  is("R2 teacher PUT another user's Tarbiyah -> 403", 403, await http('PUT', `/behaviour/tarbiyah/${tTheirs}`, tok.teacher, { teacherObservations: 'hijack' }));
  is('R2 teacher PUT a legacy Tarbiyah (no author) -> 403', 403, await http('PUT', `/behaviour/tarbiyah/${tLegacy}`, tok.teacher, { teacherObservations: 'x' }));
  { const d = await db.collection('tarbiyah_assessments').findOne({ _id: O(tTheirs) }); row('R2 the other record is untouched', 'no observations', String(d.teacherObservations), !d.teacherObservations); }
  is("R2 admin PUT another user's Tarbiyah (kept)", 200, await http('PUT', `/behaviour/tarbiyah/${tTheirs}`, tok.admin, { teacherObservations: 'admin edit' }));
  is('R2 principal PUT legacy Tarbiyah (kept)', 200, await http('PUT', `/behaviour/tarbiyah/${tLegacy}`, tok.principal, { teacherObservations: 'p' }));
  is('R2 PUT unknown Tarbiyah -> 404', 404, await http('PUT', `/behaviour/tarbiyah/${new mongoose.Types.ObjectId()}`, tok.admin, {}));
  is('R2 PUT malformed Tarbiyah id -> 400', 400, await http('PUT', '/behaviour/tarbiyah/nope', tok.admin, {}));
  is('R2 parent PUT Tarbiyah -> 403', 403, await http('PUT', `/behaviour/tarbiyah/${tMine}`, tok.parent, {}));
  { const r = await http('POST', '/behaviour/tarbiyah', tok.teacher, { studentId: student, studentName: 'Boot Student', grade: '5', period: 'T-new', periodType: 'termly', assessmentDate: new Date().toISOString(), traits: [], assessedBy: 'Spoof', assessedById: uid('admin') });
    const d = r.json?._id && await db.collection('tarbiyah_assessments').findOne({ _id: O(r.json._id) });
    row('R2 teacher POST Tarbiyah: recorded as themselves (spoofed author ignored)', '201, author = teacher', `${r.status}, ${d ? (String(d.assessedById) === uid('teacher') ? 'author=teacher' : 'author WRONG') : 'no doc'}`, r.status === 201 && d && String(d.assessedById) === uid('teacher') && d.assessedBy !== 'Spoof'); }

  is('R2 teacher POST Tarbiyah with a bad periodType -> 400 naming the field (was HTTP 500)', 400, await http('POST', '/behaviour/tarbiyah', tok.teacher, { studentId: student, studentName: 'x', grade: '5', period: 'T-bad', periodType: 'whenever', assessmentDate: new Date().toISOString(), traits: [] }));

  // ============================ library reads + borrower tenant ============================
  const libReads = ['/academics/library/stats', '/academics/library/search?q=x', '/academics/library/books', '/academics/library/issues', '/academics/library/overdue', '/academics/library/reservations', '/academics/library/reports/defaulters'];
  for (const p of libReads) {
    for (const role of ['parent', 'student']) is(`R2 ${role} GET ${p.split('?')[0]} -> 403`, 403, await http('GET', p, tok[role]));
    notDenied(`R2 teacher GET ${p.split('?')[0]} (kept)`, await http('GET', p, tok.teacher));
    notDenied(`R2 admin GET ${p.split('?')[0]} (kept)`, await http('GET', p, tok.admin));
  }
  const bookId = new mongoose.Types.ObjectId();
  await db.collection('libraryBooks').insertOne({ _id: bookId, tenantId: tenantA, institutionId: tenantA, accessionNo: 'R2-1', title: 'T', author: 'A', category: 'other', totalCopies: 3, availableCopies: 3, status: 'active', isActive: true, createdAt: new Date(), updatedAt: new Date() });
  const foreignStaff = new mongoose.Types.ObjectId(), foreignStudent = new mongoose.Types.ObjectId();
  await db.collection('staff').insertOne({ _id: foreignStaff, tenantId: tenantB, institutionId: tenantB, employeeId: 'R2-B', firstName: 'Foreign', lastName: 'Staff', status: 'active', isActive: true, createdAt: new Date(), updatedAt: new Date() });
  await db.collection('students').insertOne({ _id: foreignStudent, tenantId: O(tenantB), schoolSlug: st.tenantB.slug, firstName: 'Foreign', lastName: 'Student', studentId: `R2-F-${foreignStudent}`, createdAt: new Date(), updatedAt: new Date() });
  is('R2 issue a book to a STAFF member of another school -> 404 (was accepted)', 404, await http('POST', '/academics/library/issue', tok.admin, { bookId: String(bookId), borrowerType: 'staff', borrowerId: String(foreignStaff) }));
  is('R2 issue a book to a STUDENT of another school -> 404 (was accepted)', 404, await http('POST', '/academics/library/issue', tok.admin, { bookId: String(bookId), borrowerType: 'student', borrowerId: String(foreignStudent) }));
  is('R2 reserve for a student of another school -> 404', 404, await http('POST', '/academics/library/reservations', tok.admin, { bookId: String(bookId), borrowerType: 'student', borrowerId: String(foreignStudent) }));
  is('R2 malformed borrowerId -> 400', 400, await http('POST', '/academics/library/issue', tok.admin, { bookId: String(bookId), borrowerType: 'student', borrowerId: 'nope' }));
  is('R2 issue a book to a student of the SAME school (kept)', [200, 201], await http('POST', '/academics/library/issue', tok.admin, { bookId: String(bookId), borrowerType: 'student', borrowerId: student }));
  is('R2 issue a book to a staff member of the SAME school (kept)', [200, 201], await http('POST', '/academics/library/issue', tok.admin, { bookId: String(bookId), borrowerType: 'staff', borrowerId: st.staff[2] }));

  // ============================ Early Years ============================
  const mkKid = async (n, camp) => { const _id = new mongoose.Types.ObjectId(); await db.collection('students').insertOne({ _id, tenantId: O(tenantA), schoolSlug: slug, firstName: `Kid${n}`, lastName: 'ECE', studentId: `R2-K-${_id}`, programType: 'early-years', status: 'active', campusId: camp, currentGrade: 'KG1', createdAt: new Date(), updatedAt: new Date() }); return String(_id); };
  const otherCampus = String(new mongoose.Types.ObjectId());
  const kidHere = await mkKid(1, campusId), kidThere = await mkKid(2, otherCampus), kidNone = await mkKid(3, undefined);
  { const t = await http('GET', '/ece/children', tok.teacher); const ids = (Array.isArray(t.json) ? t.json : []).map((k) => String(k._id));
    row('R2 teacher GET /ece/children: only their own campus', 'has kid1, not kid2, not kid3', `${ids.includes(kidHere)}/${ids.includes(kidThere)}/${ids.includes(kidNone)}`, t.status === 200 && ids.includes(kidHere) && !ids.includes(kidThere) && !ids.includes(kidNone)); }
  { const o = await http('GET', '/ece/children', tok.owner); const ids = (Array.isArray(o.json) ? o.json : []).map((k) => String(k._id));
    row('R2 owner GET /ece/children: the whole school', 'all three', `${ids.includes(kidHere)}/${ids.includes(kidThere)}/${ids.includes(kidNone)}`, o.status === 200 && ids.includes(kidHere) && ids.includes(kidThere) && ids.includes(kidNone)); }
  is('R2 teacher GET profile of a child at their campus (kept)', 200, await http('GET', `/ece/students/${kidHere}/profile`, tok.teacher));
  is('R2 teacher GET profile of a child at ANOTHER campus -> 403', 403, await http('GET', `/ece/students/${kidThere}/profile`, tok.teacher));
  is('R2 teacher GET portfolio of another campus -> 403', 403, await http('GET', `/ece/students/${kidThere}/portfolio`, tok.teacher));
  is('R2 teacher GET care records of another campus -> 403', 403, await http('GET', `/ece/care-records/${kidThere}`, tok.teacher));
  is('R2 teacher GET allergies of another campus -> 403', 403, await http('GET', `/ece/students/${kidThere}/allergies`, tok.teacher));
  is('R2 teacher GET support cases for a child of another campus -> 403', 403, await http('GET', `/ece/support-cases?studentId=${kidThere}`, tok.teacher));
  is('R2 teacher quick-observe a child of another campus -> 403', 403, await http('POST', '/ece/observations/quick', tok.teacher, { studentId: kidThere, skillId: String(new mongoose.Types.ObjectId()), progressionLevel: 'emerging' }));
  is('R2 teacher create an observation for a child of ANOTHER SCHOOL -> 404', 404, await http('POST', '/ece/observations', tok.teacher, { studentId: String(foreignStudent), observationType: 'spontaneous', context: 'x', narrative: 'n', skillMappings: [] }));
  is('R2 owner GET profile of the other-campus child (institution level)', 200, await http('GET', `/ece/students/${kidThere}/profile`, tok.owner));
  is('R2 teacher GET /ece/dashboard (kept)', 200, await http('GET', '/ece/dashboard', tok.teacher));
  is('R2 owner GET /ece/coordinator/coverage (kept)', 200, await http('GET', '/ece/coordinator/coverage', tok.owner));
  for (const [m, p] of [['POST', '/ece/frameworks'], ['PATCH', `/ece/frameworks/${new mongoose.Types.ObjectId()}`], ['POST', '/ece/domains'], ['POST', '/ece/domains/seed-default'], ['POST', '/ece/domains/seed-pakistan-snc'], ['POST', '/ece/skills'], ['POST', '/ece/indicators'], ['POST', '/ece/age-bands'], ['POST', '/ece/framework-mappings'], ['DELETE', `/ece/framework-mappings/${new mongoose.Types.ObjectId()}`]]) {
    is(`R2 teacher ${tag(m, p)} -> 403 (configuration is admin-only)`, 403, await http(m, p, tok.teacher, m === 'DELETE' ? undefined : {}));
    notDenied(`R2 admin ${tag(m, p)} (not denied; a bad body is the route's own 400)`, await http(m, p, tok.admin, m === 'DELETE' ? undefined : {}));
  }
  is('R2 teacher GET /ece/frameworks (kept: needed to observe)', 200, await http('GET', '/ece/frameworks', tok.teacher));

  // ============================ approval routes ============================
  // --- institution approval requests
  const approval = async (requestedBy, status = 'pending') => { const _id = new mongoose.Types.ObjectId(); await db.collection('compliance_approval_requests').insertOne({ _id, schoolSlug: slug, title: 'R2', category: 'other', requestedBy, status, approvalChain: [{ order: 0, approverName: 'x', status: 'pending' }], createdAt: new Date(), updatedAt: new Date() }); return String(_id); };
  const a1 = await approval('Some Teacher');
  for (const role of ['teacher', 'parent', 'student', 'librarian'].filter((r) => tok[r])) is(`R2 ${role} POST approvals/:id/decide -> 403`, 403, await http('POST', `/compliance/approvals/${a1}/decide`, tok[role], { decision: 'approved' }));
  is('R2 teacher PUT approvals/:id -> 403', 403, await http('PUT', `/compliance/approvals/${a1}`, tok.teacher, { status: 'approved' }));
  for (const role of ['parent', 'student']) { is(`R2 ${role} GET /compliance/approvals -> 403`, 403, await http('GET', '/compliance/approvals', tok[role])); is(`R2 ${role} POST /compliance/approvals -> 403`, 403, await http('POST', '/compliance/approvals', tok[role], { title: 'x' })); }
  is('R2 teacher GET /compliance/approvals (kept)', 200, await http('GET', '/compliance/approvals', tok.teacher));
  is('R2 teacher POST /compliance/approvals (kept: any staff raises a request)', 201, await http('POST', '/compliance/approvals', tok.teacher, { title: 'Please approve', category: 'other', approvalChain: ['Principal'] }));
  { const d0 = await db.collection('compliance_approval_requests').findOne({ _id: O(a1) }); row('R2 the request is still pending after every refused attempt', 'pending', d0.status, d0.status === 'pending'); }
  const own = await approval(name.principal);
  is('R2 principal decides their OWN request -> 403 (no self-approval)', 403, await http('POST', `/compliance/approvals/${own}/decide`, tok.principal, { decision: 'approved' }));
  { const d = await db.collection('compliance_approval_requests').findOne({ _id: O(own) }); row('R2 own request still pending', 'pending', d.status, d.status === 'pending'); }
  is("R2 admin decides the principal's request (kept)", [200, 201], await http('POST', `/compliance/approvals/${own}/decide`, tok.admin, { decision: 'approved', comments: 'ok' }));
  { const d = await db.collection('compliance_approval_requests').findOne({ _id: O(own) }); row('R2 decision recorded', 'approved by admin', `${d.status} by ${d.decidedBy}`, d.status === 'approved' && d.decidedBy === name.admin); }
  is('R2 deciding it again -> 409 (was HTTP 500)', 409, await http('POST', `/compliance/approvals/${own}/decide`, tok.admin, { decision: 'rejected' }));
  is('R2 hr_manager decides (kept: hiring/hr requests)', [200, 201], await http('POST', `/compliance/approvals/${await approval('Someone Else')}/decide`, tok.hr_manager, { decision: 'approved' }));
  is('R2 finance_manager decides (kept: budget/procurement requests)', [200, 201], await http('POST', `/compliance/approvals/${await approval('Someone Else')}/decide`, tok.finance_manager, { decision: 'rejected' }));
  is('R2 the owner decides their own request (exempt)', [200, 201], await http('POST', `/compliance/approvals/${await approval(name.owner)}/decide`, tok.owner, { decision: 'approved' }));
  is('R2 bad decision value -> 400', 400, await http('POST', `/compliance/approvals/${await approval('Q')}/decide`, tok.admin, { decision: 'maybe' }));
  is('R2 unknown request -> 404', 404, await http('POST', `/compliance/approvals/${new mongoose.Types.ObjectId()}/decide`, tok.admin, { decision: 'approved' }));
  { const a = await approval('Editable'); is('R2 admin PUT approvals/:id edits the title (kept)', 200, await http('PUT', `/compliance/approvals/${a}`, tok.admin, { title: 'New title', status: 'approved', decidedBy: 'me' }));
    const d = await db.collection('compliance_approval_requests').findOne({ _id: O(a) }); row('R2 PUT cannot record a decision: title changed, status/decidedBy untouched', 'New title, pending, no decidedBy', `${d.title}, ${d.status}, ${d.decidedBy ?? 'none'}`, d.title === 'New title' && d.status === 'pending' && !d.decidedBy); }
  await db.collection('users').updateOne({ _id: O(uid('victim')) }, { $set: { customRoleId: null } });
  await setRole([{ moduleKey: 'institution', subModuleKey: 'approvals', level: 'manage' }]);
  is('R2 a custom role with institution:approvals:manage decides', [200, 201], await http('POST', `/compliance/approvals/${await approval('Someone')}/decide`, tok.victim, { decision: 'approved' }));
  await setRole([{ moduleKey: 'institution', subModuleKey: 'policies', level: 'manage' }]);
  is('R2 a custom role with a SIBLING institution sub-module does not', 403, await http('POST', `/compliance/approvals/${await approval('Someone')}/decide`, tok.victim, { decision: 'approved' }));
  await db.collection('users').updateOne({ _id: O(uid('victim')) }, { $set: { customRoleId: null } });

  // --- document workflows
  let wfN = 0;
  const wf = async (over = {}) => { const _id = new mongoose.Types.ObjectId(); await db.collection('workflow_instances').insertOne({ _id, instanceNumber: `R2-${Date.now()}-${++wfN}`, workflowName: 'R2', workflowType: 'custom', initiatedBy: 'Initiator X', initiatedById: new mongoose.Types.ObjectId(), schoolSlug: slug, currentStep: 1, status: 'in_progress', steps: [{ stepOrder: 1, stepName: 's1', status: 'pending', assignedTo: name.teacher, assignedToId: O(uid('teacher')), action: 'approve' }, { stepOrder: 2, stepName: 's2', status: 'pending', assignedTo: name.admin, assignedToId: O(uid('admin')), action: 'approve' }], createdAt: new Date(), updatedAt: new Date(), ...over }); return String(_id); };
  for (const role of ['parent', 'student']) is(`R2 ${role} PATCH workflows/:id/action -> 403`, 403, await http('PATCH', `/documents/workflows/${await wf()}/action`, tok[role], { stepOrder: 1, action: 'approve' }));
  { const w = await wf(); is('R2 a staff member who is NOT the assignee -> 403', 403, await http('PATCH', `/documents/workflows/${w}/action`, tok.principal, { stepOrder: 1, action: 'approve' }));
    is('R2 the assignee approves the current step (kept)', 200, await http('PATCH', `/documents/workflows/${w}/action`, tok.teacher, { stepOrder: 1, action: 'approve', actionBy: 'Spoofed Person', comments: 'ok' }));
    const d = await db.collection('workflow_instances').findOne({ _id: O(w) });
    row('R2 the stored actor is the signed-in user (the spoofed actionBy is ignored); next step current', `${name.teacher}, step 2`, `${d.steps[0].actionBy}, step ${d.currentStep}`, d.steps[0].actionBy === name.teacher && d.currentStep === 2 && d.steps[0].status === 'approved');
    is('R2 approving the same step again -> 409', 409, await http('PATCH', `/documents/workflows/${w}/action`, tok.teacher, { stepOrder: 1, action: 'approve' }));
    is('R2 the teacher acting on step 2 (assigned to admin) -> 403', 403, await http('PATCH', `/documents/workflows/${w}/action`, tok.teacher, { stepOrder: 2, action: 'approve' })); }
  { const w = await wf(); is('R2 out-of-order: the assignee of step 2 acts while step 1 is current -> 409', 409, await http('PATCH', `/documents/workflows/${w}/action`, tok.admin, { stepOrder: 2, action: 'approve' })); }
  { const w = await wf({ initiatedById: O(uid('teacher')), initiatedBy: name.teacher }); is('R2 SELF-APPROVAL: the initiator is also the assignee -> 403', 403, await http('PATCH', `/documents/workflows/${w}/action`, tok.teacher, { stepOrder: 1, action: 'approve' }));
    const d = await db.collection('workflow_instances').findOne({ _id: O(w) }); row('R2 the self-approval attempt changed nothing', 'pending, step 1', `${d.steps[0].status}, ${d.currentStep}`, d.steps[0].status === 'pending' && d.currentStep === 1); }
  { const w = await wf({ status: 'cancelled' }); is('R2 acting on a cancelled workflow -> 409', 409, await http('PATCH', `/documents/workflows/${w}/action`, tok.teacher, { stepOrder: 1, action: 'approve' })); }
  { const w = await wf(); is('R2 reject ends the workflow (kept)', 200, await http('PATCH', `/documents/workflows/${w}/action`, tok.teacher, { stepOrder: 1, action: 'reject' })); const d = await db.collection('workflow_instances').findOne({ _id: O(w) }); row('R2 status rejected', 'rejected', d.status, d.status === 'rejected'); }
  is('R2 bad action -> 400', 400, await http('PATCH', `/documents/workflows/${await wf()}/action`, tok.teacher, { stepOrder: 1, action: 'maybe' }));
  { const w = await wf({ initiatedById: O(uid('teacher')), initiatedBy: name.teacher });
    is('R2 cancel by someone who did not start it -> 403', 403, await http('PATCH', `/documents/workflows/${w}/cancel`, tok.principal, { reason: 'x' }));
    is('R2 cancel by the initiator (kept)', 200, await http('PATCH', `/documents/workflows/${w}/cancel`, tok.teacher, { reason: 'changed my mind' }));
    is('R2 cancel again -> 409', 409, await http('PATCH', `/documents/workflows/${w}/cancel`, tok.teacher, { reason: 'x' })); }
  is('R2 parent PATCH workflows/:id/cancel -> 403', 403, await http('PATCH', `/documents/workflows/${await wf()}/cancel`, tok.parent, {}));
  is('R2 parent GET workflows/my-approvals -> 403', 403, await http('GET', '/documents/workflows/my-approvals', tok.parent));
  is('R2 teacher GET workflows/my-approvals (kept: the Approvals tab)', 200, await http('GET', '/documents/workflows/my-approvals', tok.teacher));

  // --- substitution cover
  let fxN = 0;
  const fixture = async (originalStaff, over = {}) => { const _id = new mongoose.Types.ObjectId(); await db.collection('substitutions').insertOne({ _id, tenantId: tenantA, institutionId: tenantA, campusId: null, date: new Date(Date.now() + (++fxN) * 86400000), dayOfWeek: 1, timetableId: new mongoose.Types.ObjectId(), periodNo: fxN, gradeLevel: '5', sectionName: 'A', originalTeacherId: O(originalStaff), originalTeacherName: 'Absent T', status: 'open', reason: 'absence', createdAt: new Date(), updatedAt: new Date(), ...over }); return String(_id); };
  const sub = st.staff[2];
  for (const [m, mk] of [['POST', (id) => `/teaching/fixtures/${id}/assign`], ['PATCH', (id) => `/teaching/fixtures/${id}/cancel`], ['GET', (id) => `/teaching/fixtures/${id}/suggestions`]]) {
    for (const role of ['teacher', 'parent', 'student']) is(`R2 ${role} ${m} ${mk(':id').replace('/teaching/fixtures', '')} -> 403`, 403, await http(m, mk(await fixture(st.staff[1])), tok[role], m === 'POST' ? { substituteTeacherId: sub } : m === 'PATCH' ? {} : undefined));
  }
  for (const role of ['teacher', 'parent', 'student']) is(`R2 ${role} POST generate-for-absence -> 403`, 403, await http('POST', '/teaching/fixtures/generate-for-absence', tok[role], { teacherId: st.staff[1], date: '2030-01-07' }));
  { const f = await fixture(st.staff[1]); is('R2 principal assigns a substitute (kept)', [200, 201], await http('POST', `/teaching/fixtures/${f}/assign`, tok.principal, { substituteTeacherId: sub }));
    const d = await db.collection('substitutions').findOne({ _id: O(f) }); row('R2 assigned', 'assigned', d.status, d.status === 'assigned');
    is('R2 principal cancels it (kept)', 200, await http('PATCH', `/teaching/fixtures/${f}/cancel`, tok.principal, {}));
    is('R2 cancelling a cancelled fixture -> 409', 409, await http('PATCH', `/teaching/fixtures/${f}/cancel`, tok.principal, {})); }
  await db.collection('staff').updateOne({ _id: O(st.staff[1]) }, { $set: { userId: O(uid('principal')) } });
  { const f = await fixture(st.staff[1]); is('R2 SELF-ASSIGNMENT: the absent teacher (a principal with a Staff record) assigns their own cover -> 403', 403, await http('POST', `/teaching/fixtures/${f}/assign`, tok.principal, { substituteTeacherId: sub }));
    const d = await db.collection('substitutions').findOne({ _id: O(f) }); row('R2 nothing assigned', 'open', d.status, d.status === 'open');
    is('R2 another admin assigns that cover (kept)', [200, 201], await http('POST', `/teaching/fixtures/${f}/assign`, tok.admin, { substituteTeacherId: sub })); }

  // --- assessment status
  const ass = async (status) => { const _id = new mongoose.Types.ObjectId(); await db.collection('assessments').insertOne({ _id, schoolSlug: slug, title: 'R2', type: 'quiz', grade: '5', academicYear: '2025-26', startDate: new Date(), status, createdAt: new Date(), updatedAt: new Date() }); return String(_id); };
  for (const role of ['parent', 'student']) is(`R2 ${role} PATCH /assessments/:id/status -> 403`, 403, await http('PATCH', `/assessments/${await ass('draft')}/status`, tok[role], { status: 'ongoing' }));
  { const a = await ass('draft');
    is('R2 teacher: draft -> scheduled (kept)', 200, await http('PATCH', `/assessments/${a}/status`, tok.teacher, { status: 'scheduled' }));
    is('R2 teacher: scheduled -> ongoing (kept)', 200, await http('PATCH', `/assessments/${a}/status`, tok.teacher, { status: 'ongoing' }));
    is('R2 teacher: ongoing -> completed (kept)', 200, await http('PATCH', `/assessments/${a}/status`, tok.teacher, { status: 'completed' }));
    is('R2 teacher: completed -> result_published -> 403 (publishing is admin-only)', 403, await http('PATCH', `/assessments/${a}/status`, tok.teacher, { status: 'result_published' }));
    is('R2 bogus status -> 400 (any string used to be stored)', 400, await http('PATCH', `/assessments/${a}/status`, tok.teacher, { status: 'whatever' }));
    is('R2 principal publishes (kept)', 200, await http('PATCH', `/assessments/${a}/status`, tok.principal, { status: 'result_published' }));
    is('R2 teacher cannot withdraw published results -> 403', 403, await http('PATCH', `/assessments/${a}/status`, tok.teacher, { status: 'ongoing' }));
    const d = await db.collection('assessments').findOne({ _id: O(a) }); row('R2 status is still result_published after the refused withdrawal', 'result_published', d.status, d.status === 'result_published'); }
  is('R2 unknown assessment -> 404', 404, await http('PATCH', `/assessments/${new mongoose.Types.ObjectId()}/status`, tok.admin, { status: 'draft' }));

  // ============================ report ============================
  console.log(`| check | expected | actual | ok |\n|---|---|---|---|`);
  for (const r of rows) console.log(`| ${r.what} | ${r.expected} | ${r.actual} | ${r.ok ? 'yes' : 'NO'} |`);
  console.log(`\nTOTAL ${rows.length}, FAILED ${failed}`);
  if (failed) console.log('FAILED: ' + JSON.stringify(rows.filter((r) => !r.ok), null, 1));
  console.log(JSON.stringify({ label, total: rows.length, failed }));
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
