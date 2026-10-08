# Staff portal: backend for the Eldermin Teacher app

Branch `feat/staff-portal` -> `main`. Rebased on origin/main fb9225d on 2026-10-07 (previously e2486db, PR #130, on 2026-10-06); the rebase of all 19 commits applied with zero conflicts, so there are no resolved-conflict hunks (main's payroll/payslip-edit/deductions fix and CR80 ID-card changes in hr.controller.ts, hr.service.ts and id-cards/* merged cleanly alongside our leave guards and StaffNotifier hooks; build and 772 tests pass). Everything is additive; no existing route, response field or schema was removed or changed for non-teacher roles. No production or staging database was touched at any point; all tests use fakes.

## What this PR contains

### Phase 1: identity, staff-portal API, notifications, guards
- `staffId` + `teacherProfileId` added to the JWT, the login response and `GET /auth/me` (the web ignores them). Server code never trusts them: identity is always re-read from the DB via `Staff.userId`.
- New module `src/staff-portal/` under `/api/v1/staff-portal` (class-level `@Roles` for school-staff roles; parent/student/reseller excluded): `me`, notifications (list, unread-count, read, read-all), message threads with guardians (list, create, messages, send, read, close), student guardians, student-leave review (class teachers only), device-token register/remove, account-deletion request (creates a row, never deletes).
- Best-effort notification emitters (never fail the action): lesson plan approve/reject, substitution assigned, PTM created/rescheduled (teacher notified; the guardian notifications added on main are kept), staff leave status change. Notification `type` enum extended additively (`ptm`, `substitution`, `lesson_plan`, `leave_status`).
- Hardening: 76 additive route guards (`@RolesOrModuleManage`) on admin and staff-write routes, with a DB-backed custom-role fallback (live lookup of `User.customRoleId` -> `Role.moduleAccess`, fails closed); leave self-approval block + status validation in `HrService.updateLeaveStatus`.
- Tolerant grade/section matching (`src/common/utils/class-match.util.ts`: `Grade 5` = `5` = `G5`, case/space tolerant; `5` != `15`) and a read-only audit script `npm run audit:teacher-class-matching -- --schoolSlug=<slug> --yes`.

### Phase 4 additions (read-only, own-data)
- `GET /staff-portal/homework/pending-grading?limit=` (default 50, max 200): ungraded submissions across my non-draft assignments, one aggregation, `total` independent of `limit`.
- `GET /staff-portal/timetable?date=` or `?from=&to=` (max 14 days): my slots across all active timetables, including teachers who appear only in `splitGroups`. A/B weeks are NOT guessed (day `weekCycle` is `null`; each slot carries `both|A|B`).
- Details and UNVERIFIED items: `docs/staff-portal/PHASE4_ADDITIONS.md`.

### Teacher identity fixes (role `teacher` only)
Helper `src/staff-portal/teacher-identity.util.ts`. A teacher can no longer act as someone else:
- `POST/PATCH/DELETE /teaching/assignments`: `teacherId` derived/normalised to my `Staff._id` (own Staff or TeacherProfile id accepted), others 403; update/delete require ownership.
- `POST/PATCH /teaching/lesson-plans`: same rule; tenant/campus fields stripped on PATCH.
- Lesson-plan self-approval: a teacher can no longer set `status: approved` (or approver fields) through create or PATCH; only `draft`/`submitted`.
- `POST/PUT /behaviour/records`: `reportedBy`/`reportedById` forced to the caller; PUT strips reporter/school/campus fields.
- `POST /teaching/ptm`, `PATCH ptm/:id/reschedule|outcome`: own-teacher rule and ownership.
- Audit of the remaining body-identity routes: `docs/staff-portal/hardening-backlog.md`.

### Phase 6 fixes: marks, remarks, quiz (role `teacher` only unless stated)
Details: `docs/staff-portal/PHASE6_FIXES.md`.
- `POST /assessments/marks/bulk`: marks must be within `0..subject total` (400 listing students); any verified row rejects the whole request (409, nothing written); absent/exempt rows explicitly null `percentage`/`grade_result`/`gpa` (Mongoose strips `undefined` in `$set`, so they went stale).
- `PATCH /assessments/report-cards/:id/remarks`: only the class teacher of the card's grade/section (403 otherwise); only `classTeacherRemarks` writable; unknown id 404.
- `POST /assessments/quiz-attempts/:id/grade`: per-question `0..max` bounds (400), no re-grade of a graded attempt (409), must teach the attempt's class (403).
- `GET /assessments/quiz-attempts` (+ `/:attemptId`): server-side scoped to the teacher's classes (detail outside them 403).
- **All roles (data-integrity fix):** quiz completion no longer overwrites a `verified` MarkEntry or a manually entered one; only quiz-written entries are updated, tracked by a new additive field `MarkEntry.quizAttemptId` (plus the legacy `enteredBy: 'Online Quiz (auto)'` marker).

### Phase 6 follow-up: B5 privacy, B4 guards, quiz subject scope, curriculum drafts
Details: `docs/staff-portal/PHASE6_FIXES.md` (second half). Role `teacher` only unless stated; every other role proven unchanged by matrix tests.
- **B5 privacy:** shared deny-list helper `src/students/teacher-student-projection.util.ts` strips fees/finance, guardian and student phone numbers, CNIC/national id/B-form/passport, guardian income/employer/occupation from `GET /students`, `/:id`, `/:id/360`, `/:id/learning`, grades-sections, class-roster-diagnostic, attendance list/summary, guardians/list and all `/teaching/ptm` responses; DB-side `select`, fee reads skipped, guardian-phone search removed for teachers; `students/fees/list` and `:id/fees/statement` 403 for teachers. Owner-decision list of fields intentionally still returned (guardian email, DOB, address, medical detail, documents) is in the docs.
- **B4 guards:** `PATCH assessments/marks/verify`, `POST report-cards/generate|publish` are admin-set only (`TEACHING_ADMIN_ROLES`, sub-module custom grants only); teacher/parent/student get 403. The web may still show those buttons to teachers (they will 403).
- **Quiz scope:** class teacher = all subjects of own class; subject teacher = assigned class+subject; union for both (list, detail, grade); tolerant grade/section/subject match.
- **Curriculum:** teachers see only `status: active` (list forced, detail 404); other roles tenant-wide as today.
- Tests: 4 new specs/rows (+132 tests); full suite 48 suites / 945 tests, `npm run build` clean.

### Docs
`docs/staff-portal/`: `PHASE1_REPORT.md`, `guard-inventory.md`, `guards-added.md`, `hardening-backlog.md` (now with a FIXED/OPEN table for the Phase 6 candidates), `PHASE4_ADDITIONS.md`, `PHASE6_FIXES.md`, this file.

## Rebase note
The branch was rebased onto the latest `origin/main` (11 commits ahead of the old base: parent-portal sync, teacher assigned subjects/grades, teacher-directory campus fix, guardian notifications for PTM/behaviour). This rewrites the branch history: the branch was force-pushed with `--force-with-lease`; anyone who checked it out should re-fetch. Conflicts were confined to `scope.util.ts`, `auth.service.ts`, `jwt.strategy.ts`, `class-match.util.ts`, `ptm.service.ts` and `teaching.service.ts` and were resolved as a union: main's `subjectsCanTeach`/`gradeLevelsCanTeach` and `gradeMatcher`/`sectionMatcher` kept next to our `staffId`/`teacherProfileId`; PTM create/reschedule now notify BOTH the guardians (main) and the teacher (this PR).

## New endpoints
`/api/v1/staff-portal`: `GET me`; `GET notifications`; `GET notifications/unread-count`; `POST notifications/read-all`; `POST notifications/:id/read`; `GET threads`; `POST threads`; `GET threads/:id/messages`; `POST threads/:id/messages`; `POST threads/:id/read`; `PATCH threads/:id/close`; `GET students/:studentId/guardians`; `GET student-leaves`; `PATCH student-leaves/:id`; `GET homework/pending-grading`; `GET timetable`; `POST device-token`; `DELETE device-token`; `POST account/delete-request`. No other new routes; the fixes above change the behaviour of existing routes for role `teacher` only.

## Security notes
- Teacher-only enforcement uses the JWT base role `teacher` (`isTeacherCaller`). A teacher who also holds a custom role is still treated as a teacher by these fixes.
- Teacher identity and classes are resolved from the DB per request; a stale token cannot act for a removed staff member. No Staff record -> 403.
- Remaining known gaps (not fixed here, listed in `hardening-backlog.md`): `/roles` create/assign and most of `/hr/*` unguarded, `ModulesController` trusts `x-school-slug`, student class/campus scoping (fee/phone/id fields are now stripped for teachers), attendance scope holes, marks/bulk has no assessment ownership scoping for teachers, `GET library/books/:id` writes on GET and returns borrower history (`academics.service.ts:531-545`), `library/search` unscoped, `GET /assessments` campus-only with no max limit, published report cards still editable, admin roles can still re-grade quizzes and overwrite verified marks via marks/bulk.

## Testing
`npm run build` clean; `npx jest`: 48 suites / 945 tests pass (latest; was 42 / 772 before the B0 and follow-up work) (Phase 6 added 64 tests across four specs; Phase 4 added 20; identity and notification hooks have their own specs). All with in-memory fakes, no DB. Non-teacher role matrices (principal, admin, institution_owner, vice_principal, academic_coordinator, super_admin) assert unchanged behaviour for each Phase 6 fix.

## Deploy notes
1. **Before deploying, run the pre-flight Mongo query (read-only) against production** to find logins that could lose access to the newly guarded admin routes (custom-role trap; full reasoning in `docs/staff-portal/guard-inventory.md` section 4.2):
```js
const roles = db.roles.find({ moduleAccess: { $elemMatch: { moduleKey: 'teaching', level: 'manage' } } }, { _id: 1, name: 1, isSystemDefault: 1 }).toArray();
db.users.find({
  customRoleId: { $in: roles.map(r => r._id) },
  primaryRole: { $nin: ['super_admin','institution_owner','principal','vice_principal','admin','academic_coordinator'] },
  isActive: true,
}, { email: 1, primaryRole: 1, customRoleId: 1, schoolSlug: 1 })
```
Repeat with `moduleKey: 'hr'` (HR set) and `'apps'` (modules set). Hits need a sub-module grant or an admin primary role. The stock "Teacher" custom role (module-wide `teaching:manage`) intentionally does NOT pass the admin-set routes.
2. New collections created lazily: `staff_device_tokens`, `staff_deletion_requests`. New optional field `MarkEntry.quizAttemptId` (no index, no backfill). No other schema or index changes.
3. Existing JWTs lack `staffId`/`teacherProfileId` until re-login; the staff portal does not need them.
4. The web is unaffected for non-teacher roles. Web teachers lose: marks above the total/verified-row overwrites, remarks on other classes, quiz grading/queue outside their classes, acting as another teacher.

## NOT in this PR
Push notification sending (tokens are stored only), A/B week computation, the remaining items in `hardening-backlog.md` (including the critical `/roles`, `/hr/*`, student-data scoping), parent-app changes, and any change to non-teacher role behaviour on the routes above.
