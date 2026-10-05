# Phase 1 Report — Backend additions (branch `feat/staff-portal`, uncommitted)

Base: `origin/main` 6ccdba3 (fast-forwarded; working tree was clean, nothing stashed). `main` untouched, nothing committed or pushed.
Verification: `npm run build` ✅ · `npx jest` ✅ 30 suites / 499 tests (new: `staff-portal.service.spec.ts` 12 tests, `role-sets.spec.ts` 232 assertions). `npm ci` was run because pulled `package.json` added `axios`.

## 1. Behaviour store decision (verified)
Parent app `GET parent-portal/students/:id/behaviour` reads `BehaviourRecord` (+ `TarbiyahAssessment`) — `parent-portal.service.ts:393-396`; the same model backs `POST /behaviour/records` (`behaviour.service.ts:41,159`). Teacher app uses **`/behaviour/records`** and **`/behaviour/tarbiyah`**.

## 2. Identity (additive)
- `staffId` + `teacherProfileId` added to JWT payload, login response `user`, `GET /auth/me`, `JwtStrategy.validate`, `ScopedUser` (`modules/auth/auth.service.ts`, `jwt.strategy.ts`, `auth/scope.util.ts`). Nothing removed. Existing tokens lack them until re-login; staff-portal always resolves from DB.

## 3. New module `src/staff-portal/` (all under `/api/v1/staff-portal`)
Class-level `@Roles`: all school-staff roles (parent/student/reseller excluded). Every handler also requires a linked `Staff` (by `Staff.userId`, from DB).
| Method | Path | Notes |
|---|---|---|
| GET | /me | user, staffId, teacherProfileId, teacherProfile (subjects, grades, assignments, classTeacherOf), campus, department, institution{activeModules}, permissions |
| GET | /notifications?limit&before&unread | cursor pagination; returns `unreadCount` |
| GET | /notifications/unread-count | cheap poll |
| POST | /notifications/:id/read · /notifications/read-all | |
| GET | /threads?status | threads where staffId = me |
| POST | /threads | `{studentId, guardianUserId, subject, firstMessage}`; student must be in a class I teach; guardian must be linked to the student |
| GET | /threads/:id/messages | own threads only |
| POST | /threads/:id/messages | `{body}`; sets `guardianHasUnread`, notifies guardian (type `message`); 409 if closed |
| POST | /threads/:id/read · PATCH /threads/:id/close | |
| GET | /students/:studentId/guardians | names only; student must be in my classes |
| GET | /student-leaves?status&limit | class teachers only; students of my class |
| PATCH | /student-leaves/:id | `{status: approved\|rejected, remarks?}`; class-teacher scope; 409 if already decided; notifies guardian (`leave_decision`) |
| POST/DELETE | /device-token | stores token only (no push sending in v1) |
| POST | /account/delete-request | `{confirm:true, reason?}`; creates `staff_deletion_requests` row, notifies owner/principal/admin/hr; never deletes |

New collections: `staff_device_tokens`, `staff_deletion_requests`. Notification `type` enum extended additively: `ptm`, `substitution`, `lesson_plan`, `leave_status`.

## 4. Notification emitters (best-effort, never fail the action; `StaffNotifier` injected as trailing `@Optional()` param)
- Lesson plan approved/rejected → author (`teaching.service.ts`)
- Substitution assigned → substitute (`substitution.service.ts`)
- PTM created/rescheduled → teacher (`ptm.service.ts`; create skips if actor is the teacher)
- Staff leave status change → applicant (`hr.service.ts`)
- Parent message / student leave decision → emitted by staff-portal itself
Existing specs untouched. These notify paths have no dedicated unit tests yet (only the staff-portal ones do).

## 5. Hardening (additive `@Roles`; full table in `guards-added.md`; web-role analysis in `guard-inventory.md`)
76 decorators: TEACHING_ADMIN 31 · HR_LEAVE_ADMIN 9 · MODULES_ADMIN 4 · STAFF_WRITE 32. Role sets in `src/auth/role-sets.ts`.
- Escalation set you named: teacher CRUD, timetable/rooms/period-templates/duty-roster/electives/variants writes, lesson-plan approve/reject, `PATCH hr/leave/:id/status`, `modules/*activate*`.
- Plus self-approval block in `HrService.updateLeaveStatus` (403 if approver's own staff record = applicant; `super_admin`/`institution_owner` exempt) and status enum validation.
- Teacher-app write endpoints restricted to staff roles (blocks parent/student/librarian/finance/hr/support tokens): attendance, homework, lesson plans, syllabus, marks/bulk, remarks, quiz grade, behaviour, PTM, fixtures complete, ECE observation/portfolio/weekly-plan.
- **Slightly beyond your named list (revert if unwanted):** syllabus `PATCH :id/approve` + `DELETE :id`; leave balances allocate and leave-policy writes; legacy `POST hr/leave/applications` (web's `submitLeave` for it exists but is never called). Reads were intentionally left open.
- Everything else → `hardening-backlog.md`.

## 6. Decisions / risks needing you
1. **Custom-role trap.** `@Roles` checks only `primaryRole`. Staff default to `teacher` and may hold a custom role granting `teaching:manage` (the stock "Teacher" custom role does, module-wide). Those users keep admin UI on web but now get 403 on the guarded routes. **Run the pre-flight Mongo query in `guard-inventory.md` §4.2 on production before deploying**; if it returns users, we need the DB-backed fallback guard (Option B, code in the doc) or migrate them.
2. `x-school-slug` header trust in `ModulesController` and `/roles`, `/hr/*` holes remain (backlog, critical).
3. Self-approval exemption: owner/super_admin allowed — confirm.
4. Messaging scope as built: any teacher who teaches a student's class (class teacher or assignment) may start a thread with that student's guardians; student-leave review is class-teacher only. Confirm.
5. Student class match uses `Student.currentGrade/currentSection` vs `TeacherProfile.classTeacherOf*`/`currentAssignments[].gradeLevel/sectionName` string equality — verify the values align in real school data.
6. Deploy note: parent app shows unknown notification types as generic; staff types are only written to staff users.
7. Not changed (backlog): marks-entry ownership/max-marks checks, student/360 scoping and fee leak, attendance scope holes.

---
## Addendum — follow-up after review (supersedes the matching parts above)

- **Custom-role fallback implemented** (`RolesOrModuleManage` + `RolesOrModuleManageGuard`, see `guards-added.md` "Option B"). A user passes if their JWT base role is allowed OR their live-looked-up custom role grants access. Admin-set routes honour only sub-module-specific custom grants (so the stock "Teacher" role's module-wide `teaching:manage` does not pass); teacher-app write routes also honour module-wide `manage`. parent/student/reseller are always refused. Fails closed on any DB error. Tests: base-role pass, custom-role pass, both-fail 403, plus edge cases. Known consequence: a hand-made role with only a module-wide `teaching`/`hr`/`apps` grant and a non-admin base role loses those admin routes — run the pre-flight query (guard-inventory §4.2) on production before deploy.
- **Legacy `POST /hr/leave/applications`**: grep of `Eldermin-Frontend` (all 126 `origin/*` branches incl. `main`) and `eldermin-parent-mobile-app` (all `origin/*` branches): the only reference is the unused `submitLeave` definition in `src/services/hr.service.ts`; no caller anywhere. Guard kept.
- **Grade/section matching**: `src/common/utils/class-match.util.ts` (trim, collapse spaces, case-insensitive, `Grade 5`/`Class 5`/`G5`/`5` equal; `5`≠`15`, `Grade 1`≠`Grade 11`). Used in staff-portal scoping and `resolveClassSectionScope`. Known remaining exact match: `students.controller` attendance list queries Mongo by the class teacher's own grade string.
- **Audit script**: `npm run audit:teacher-class-matching -- --schoolSlug=<slug> --yes` (read-only; refuses to run without both args; never run by us).
- **Notification hooks** now have tests (each hook fires; failures never fail the action; works without a notifier). Fixed PTM self-notify check by passing `actorUserId` separately (stored `requestedBy` unchanged).
- Totals: build clean; 36 suites / 653 tests pass (stable over 3 runs).
