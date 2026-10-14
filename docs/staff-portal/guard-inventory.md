# Phase 1 - Backend guard inventory (READ-ONLY analysis, no repo changes)

Date 2026-10-05. Backend `eldermin-backend` branch `feat/staff-portal` = origin/main 6ccdba3 (working tree has 3 uncommitted edits by someone else: `auth/scope.util.ts`, `modules/auth/auth.service.ts`, `modules/auth/jwt.strategy.ts`; they add `staffId`/`teacherProfileId` to the JWT, so `file:line` for those files may drift by a few lines). Web `Eldermin-Frontend` main. Paths: backend relative to `eldermin-backend/src/`, web relative to `Eldermin-Frontend/src/`. Plan section 2 = `ELDERMIN_TEACHER_APP_PLAN.md:71-110`.

---------------------------------------------------------------------------------------------------
## 1. How the backend authorization system actually works

| Piece | Fact | Evidence |
|---|---|---|
| Global guards (in order) | `JwtAuthGuard` -> `RolesGuard` (both `app.module.ts:115-116`) -> `CustomRoleGuard` (`APP_GUARD useExisting`, provided by `RolesModule`, `roles/roles.module.ts` providers block) | `app.module.ts:112-117`, `roles/roles.module.ts` |
| `@Public()` | Skips all three | `auth/decorators.ts:19` |
| `@Roles(...UserRole[])` | `SetMetadata('roles')`. `RolesGuard` does `requiredRoles.includes(user.role \|\| user.primaryRole)`; mismatch -> `403 Access denied. Required role(s): ...` | `auth/decorators.ts:10`, `auth/roles.guard.ts:21-52` |
| `@RequirePermission('x:y')` | `SetMetadata('permission')`. `RolesGuard` calls `hasPermission(role, perm)` against the **hard-coded `PERMISSIONS_MATRIX` by JWT role string only**. If a route has BOTH, both must pass (AND). | `auth/roles.guard.ts:54-61`, `auth/permissions.matrix.ts:182-185` |
| No metadata | `RolesGuard` returns true (open to any authenticated token of any role incl. parent/student/reseller) | `auth/roles.guard.ts:29-30` |
| Metadata lookup | `getAllAndOverride([handler, class])` -> **handler metadata REPLACES class metadata, it is not merged**. A class-level `@Roles` is overridden by a method-level `@Roles`. | `auth/roles.guard.ts:15-26` |
| Role source | JWT `role` = `user.primaryRole \|\| user.role` at login (`modules/auth/auth.service.ts:~82`); `JwtStrategy.validate` copies `role`, **never `permissions` or `customRoleId`** (`modules/auth/jwt.strategy.ts:16-40`). Frozen for the 7 d token life. | see files |
| Custom roles (school-defined) | `User.customRoleId` -> `Role.moduleAccess[{moduleKey, level view/manage, subModuleKey?}]`. At login `RolesService.getPermissionsForUser` flattens to `permissions: string[]` (`roles/roles.service.ts:149-165`) which goes ONLY into the login response `user.permissions` (not the JWT). The web uses it to fully override its own matrix (`types/roles.ts hasSubModulePermission`). | `auth.service.ts` login return |
| Custom role enforcement on server | Only `CustomRoleGuard`, only for routes with `@RequireModuleAccess(module, sub, level)`; **only `finance/finance.controller.ts` uses it**. It does a DB read of `User.customRoleId` then `Role.moduleAccess` per request, is a no-op for users with no `customRoleId`. `RolesGuard` never sees custom roles. | `roles/guards/custom-role.guard.ts`, grep `RequireModuleAccess` |
| Standard role strings (backend) | `super_admin, institution_owner, principal, vice_principal, admin, academic_coordinator, finance_manager, hr_manager, teacher, librarian, parent, student, support_staff, reseller_admin, reseller_support` (`auth/roles.enum.ts`). `HrService.resolvePrimaryRole` only emits the first 13 and **defaults every staff login to `teacher`** (`modules/hr/hr.service.ts:225-234`). | |
| Web role strings | `super_admin, admin, principal, teacher, student, parent, finance_officer, hr_officer, admissions, viewer, institution_owner` (`types/roles.ts:2-13, 79`). `finance_officer/hr_officer/admissions/viewer` are NOT backend roles (grep: zero hits in backend). `vice_principal, academic_coordinator, finance_manager, hr_manager, librarian, support_staff` are NOT web roles -> `roleHasPermission` returns **false for everything** (unknown role = deny), so such users can only use ungated web routes (`/dashboard /profile /knowledge-base`) UNLESS they carry a custom role (`permissions` array overrides). | |
| Existing `@Roles` precedent in same codebase | `school-calendar.controller.ts:11-14,36-92` (`CALENDAR_ADMIN_ROLES`), `assessment.controller.ts:29-33,244-295` (`QUESTION_BANK_EDITOR_ROLES`, includes TEACHER), `id-cards`, `certificates`, `knowledge-base.controller.ts:42-73` (`SUPER_ADMIN`), `students.controller.ts:189`. `compliance.controller.ts:101-127` uses `@RequirePermission('safeguarding:*')`; `hr.controller.ts:238-246` uses `@RequirePermission('leave:self')`. So role-list guards are an accepted pattern here. | |
| Tenant | `ModulesController` takes `x-school-slug` HEADER first, then JWT (`modules/modules.controller.ts:14,20,26,32,38,44`); `SchoolGuard` is not applied there. | |

### What web actually lets each web role reach (derived from `types/roles.ts:84-215`, `Sidebar.tsx:30-90`, `App.tsx:103-292` route guards)
Web gates only at sidebar + route level, at **view** level, and never inside a page (Part A section 0). So "can reach the Approve button" = holds `*:view`.

| Web permission | `view` holders | `manage` holders (matrix) |
|---|---|---|
| `teaching` (/teaching) | super_admin, institution_owner, admin, principal, **teacher**, hr_officer | super_admin, institution_owner, admin, principal |
| `hr` (/hr) | super_admin, institution_owner, admin, principal, hr_officer | super_admin, institution_owner, admin, hr_officer |
| `leave:self` (/my-leave) | teacher only | - |
| `apps` (/apps) | super_admin, institution_owner, admin, principal, teacher, finance_officer, hr_officer, admissions | super_admin, institution_owner, admin |
| `academics` (/academics /timetable /curriculum /syllabus /library) | super_admin, institution_owner, admin, principal, teacher, student | super_admin, institution_owner, admin, principal |
| `assessments` | SA, owner, admin, principal, teacher, student, parent | SA, owner, admin, principal, teacher |
| `students` | SA, owner, admin, principal, teacher, admissions, parent | SA, owner, admin, principal |
| `behaviour` | SA, owner, admin, principal, teacher, student, parent | SA, owner, admin, principal, teacher |
| `early-years` | SA, owner, admin, principal, teacher | SA, owner, admin, teacher |
| `school-calendar`, `events` | everyone except viewer | calendar: SA, owner, admin, principal; events: + finance_officer |
| `governance` (compliance/safeguarding UI) | SA, owner, admin, principal | same |
| `/knowledge-base`, `/profile`, `/dashboard` | any authenticated | - |
| Custom role (`user.permissions` non-null) | whatever the role grants, regardless of `primaryRole` (so a `teacher`-primaryRole login with a custom role can use any module) | `manage` implies view; any 3-part `module:sub:level` grant satisfies module-level view |

**Crucial interaction (regression risk):** the system-default custom role "Teacher" is `teaching:manage + students:view + assessments:manage + behaviour:manage + academics:view` (`roles/roles.service.ts:13-20`). Other defaults: Finance Officer, Admissions Officer, Front Desk (no HR default). A school that assigns custom roles to staff whose `primaryRole` is the default `teacher` gets exactly the web access the role says - a role-only backend guard that only looks at `primaryRole` would lock those people out. See section 4 for the guard that handles this.

---------------------------------------------------------------------------------------------------
## 2. Privilege-escalation set the owner named

Legend for "Web UI / callers": service line, then page line. "Roles reaching UI today" is per the table above; **bold teacher** = a plain `teacher` can click it today (UI never hides it) and the API accepts it.

| # | Endpoint (controller file:line) | Web caller | Roles that reach the web UI today | App needs? | Verdict |
|---|---|---|---|---|---|
| E1 | `PATCH /hr/leave/:id/status` `modules/hr/hr.controller.ts:295-296` -> `hr.service.ts:1272` | `services/hr.service.ts:119`; `pages/hr/index.tsx:5207` (ApproveRejectModal) | /hr is `hr:view`: super_admin, institution_owner, admin, principal, hr_officer (+ custom roles with any hr grant). `teacher` cannot reach /hr page (no `hr:view`) but API is unguarded. | NO (plan: approvals out of scope) | **GUARD** |
| E1b | `POST /hr/leave` (create leave for ANY staffId) `hr.controller.ts:292-293`, `GET /hr/leave` :289, `GET /hr/leave/stats` :252, `/leave/balance(s)*` :255-264, `POST /hr/leave/balances/allocate` :266, `/hr/leave/policies*` :271-287 | `services/hr.service.ts:117-123,133-138`; `pages/hr/index.tsx` | same as E1 | NO | **GUARD together with E1** (otherwise teacher POSTs leave for self via `leave` then PATCHes status; `leave/self` also yields a `pending` row that E1 can approve) |
| E2 | `POST /modules/:moduleId/activate` `modules/modules.controller.ts:25`, `/deactivate` :31, `/bulk-activate` :37, `/activate-all` :43 | `services/modules.api.ts:42,46,50`; `pages/marketplace/index.tsx:56,71,86` | /apps is `apps:view`: SA, owner, admin, principal, **teacher**, finance_officer, hr_officer, admissions; manage matrix: SA, owner, admin. No in-page check. | NO (apps marketplace out of scope; app only READS `activeModules` from login) | **GUARD** (`GET /modules`, `/modules/summary` :13,:19 stay open; teacher web already sees /apps) |
| E3 | `POST /teaching/teachers` `modules/teaching/teaching.controller.ts:30-31`; `PATCH /teaching/teachers/:id` :33-34; `DELETE /teaching/teachers/:id` :40-41; also `POST teachers/sync` :21 | `services/teaching.service.ts:7-10`; `pages/teaching/tabs/TeachersTab.tsx:43,285,387,441`; **`ProfileTab.tsx:56`** (PATCH from "Teacher Profile" tab) | /teaching is `teaching:view`: SA, owner, admin, principal, **teacher**, hr_officer; manage: SA, owner, admin, principal | NO (reads `GET teachers`, `teachers/by-staff/:staffId` :24,:27 stay open) | **GUARD writes**. Note: `ProfileTab` edit of a teacher profile is reachable by plain teachers on web today; guarding PATCH removes that (intended). |
| E4 | `POST/PATCH/DELETE /teaching/timetable` :81,:84,:92 (also `POST/GET timetable` for generation/edit) | `teaching.service.ts:31-33`; `TimetableTab.tsx:742,1086,1504,1844,2880,2891,2906,2928,2967,3010` | /teaching + /timetable (academics:view): SA, owner, admin, principal, **teacher** (+student for /timetable, hr_officer for /teaching) | NO (read-only timetable: `GET timetable/teacher/:staffId` :75 and `GET timetable` :78 stay open) | **GUARD** |
| E5 | `POST/PATCH/DELETE /teaching/rooms` :136,:139,:142 | `teaching.service.ts:74-76`; `TimetableTab.tsx:1181,1186` | as E4 | NO | **GUARD** (`GET rooms` :133 open) |
| E6 | `POST/PATCH/DELETE /teaching/period-templates` :150,:156,:159; `POST period-templates/seed-default` :153 | `teaching.service.ts:80-83`; `TimetableTab.tsx:1195,1200,1298`; `pages/academics/index.tsx:2965,2974` | as E4 (academics:view incl. student) | NO | **GUARD** (`GET` :147 open) |
| E7 | `POST/PATCH/DELETE /teaching/duty-roster` :122,:125,:128 | `teaching.service.ts:52-54`; `TimetableTab.tsx:2260-2261,2351` | as E4 | NO (explicitly out of scope) | **GUARD** (`GET` :119 open) |
| E8 | `POST/PATCH/DELETE /teaching/electives` :108,:111,:114 | `teaching.service.ts:46-48`; `TimetableTab.tsx:2057-2058,2174` | as E4 | NO | **GUARD** (`GET` :105 open) |
| E9 | `POST /teaching/timetable-variants/generate` `timetable-variant.controller.ts:16`, `POST :id/publish` :21, `DELETE :id` :26 | `teaching.service.ts:58,63,64`; `TimetableTab.tsx:2430,2440,2512` | as E4 | NO | **GUARD** (`GET` :10,:13 open) |
| E10 | `PATCH /teaching/lesson-plans/:id/approve` `teaching.controller.ts:45-46` -> `teaching.service` approve; `PATCH :id/reject` :48-49 | `teaching.service.ts:15,16`; `pages/teaching/tabs/LessonPlansTab.tsx:812,822` | as E3 (teaching:view) incl. **teacher** | NO (approvals out of scope unless owner confirms coordinator "Approvals") | **GUARD** (+ optional: approver != plan author) |
| E11 | Extra, same family, found while auditing: `/teaching/exams` POST/PATCH/DELETE `exam.controller.ts:13,16,19`; `PATCH /syllabus/:id/approve` `syllabus.controller.ts:130`; `DELETE /syllabus/:id` :125; `slo-templates` writes :63-85; `/teaching/fixtures` `generate-for-absence` :11, `assign` :24, `cancel` :29 (admin-ish; `complete` :34 is teacher-needed) | `teaching.service.ts:68-70,104-114`; `syllabus.service.ts:40` | teaching/academics view holders | approve/delete NO | candidates for the same `TEACHING_ADMIN` guard; **not on owner's list, flag only** |
| E12 | Extra, much worse, not on owner's list: `POST /roles` :34, `PUT /roles/:id` :40, `POST /roles/assign` :58 (`roles/roles.controller.ts`) have no guard -> any user can create a role and assign it to themselves; `PATCH /hr/staff/:id`, `POST /hr/staff/:id/reset-password` (:32), payroll, `POST /hr/staff/:id/create-login`: all of `/hr/*` except `leave/self*` is unguarded | web `/roles` page needs `institution:manage` (SA, owner, admin); `/hr` needs `hr:view` | | NO | flag to owner; out of requested scope |

### Self-approval protection on `PATCH /hr/leave/:id/status`: NONE
`updateLeaveStatus` (`hr.service.ts:1272-1313`): loads the application, `$set status/approvedBy=<JWT userId>/approvedAt/approverNote`, adjusts balance, writes attendance. It never compares `existing.staffId` with the approver's own Staff record, never validates `status` against an enum (any string stored), never checks current status is `pending`, and the controller (`hr.controller.ts:295`) has no role metadata. So today ANY authenticated token (teacher, parent, student) can approve their own leave (created via `POST hr/leave/self`, which also uses `leave:self`) and also flip balances/attendance. Safe additive fix (service level, in addition to the role guard):

```ts
// hr.service.ts updateLeaveStatus(), right after `existing` is loaded
const approverStaff = await this.staffModel
  .findOne({ tenantId: tid, userId: this.newTid(approverId) }).select('_id').lean();
if (approverStaff && String(approverStaff._id) === String(existing.staffId)) {
  throw new ForbiddenException('You cannot approve or reject your own leave request.');
}
if (!['approved', 'rejected', 'cancelled', 'pending'].includes(status)) {
  throw new BadRequestException('Invalid status');
}
```
Decision for owner: whether `institution_owner`/`super_admin` (no one above them) may self-approve; pass `req.user.role` and skip the check for those two if yes. Web regression: HR admins approving their own leave would start getting 403 (only if they also have a Staff record linked via `userId`); that is the intended behaviour change.

---------------------------------------------------------------------------------------------------
## 3. Endpoints the teacher app calls (plan section 2, modules 1-21)

Columns: endpoint + controller line | web caller | web roles reaching the UI | proposed guard. "OPEN" = leave as is (JWT only), "TEACHER-OK" = allow-list below (S_WRITE). Reads are intentionally left OPEN in Phase 1: the web itself lets `parent`/`student` hold `students|assessments|behaviour|academics|calendar|events:view`, and parent/student tokens that log in through `/auth/login` would otherwise break; scope holes on reads are a Part-B data-scoping item, not a role-guard item.

| Mod | Endpoint (controller:line) | Web caller (service:line; page) | Web roles reaching UI | Guard proposal |
|---|---|---|---|---|
| 1 | `POST /auth/login|forgot-password|reset-password`, `POST /auth/logout` `modules/auth/auth.controller.ts:28-60` (`@Public`), `GET /auth/me`, avatar | `services/auth.service.ts` | everyone | none (public/JWT) |
| 2 | `GET /teaching/dashboard` `teaching.controller.ts:16`; `GET /teaching/fixtures` `substitution.controller.ts:39`; `GET /teaching/ptm/upcoming/mine` `ptm.controller.ts:21` | `teaching.service.ts:4,107,119`; TeachingDashboard, Fixtures tab | teaching:view roles | OPEN |
| 3 | `GET /teaching/timetable/teacher/:staffId` :75, `GET /teaching/timetable` :78 | `teaching.service.ts:30`; TimetableTab | teaching:view / academics:view | OPEN |
| 4 | `GET /students/attendance/list` `students/students.controller.ts:452`; `POST /students/attendance/bulk` :482; `POST /students/attendance` :471; `GET /students/:id/attendance/summary` :460; `GET /students` :54 | `students.service.ts:106-111`, `students.api.ts:55-64`; `pages/teaching/tabs/AttendanceTab.tsx`; `pages/students/*` | students:view roles (SA, owner, admin, principal, teacher, admissions, parent); AttendanceTab via teaching:view | writes: S_WRITE (blocks parent/student/librarian/finance/hr/support tokens). Do NOT restrict reads. |
| 5 | `/teaching/assignments` GET/POST/PATCH/DELETE :167-176, `/:id/submissions` GET :179, PATCH :182 | `teaching.service.ts:88-94`; HomeworkTab | teaching:view | writes: S_WRITE |
| 6 | `/teaching/lesson-plans` GET :51, POST :54, `parse-upload` :63, PATCH :70 | `teaching.service.ts:12-24`; LessonPlansTab | teaching:view | create/patch/parse-upload: S_WRITE; approve/reject = E10 (TEACHING_ADMIN) |
| 7 | `/syllabus` GET :104,:109,`weekly-planner` :32, `PATCH :id/mark-topic` :135, `mark-sub-topic` :140, `behind-schedule` :145, `POST/PATCH/DELETE :id/lessons` :151-162, `PATCH :id/publish` :167 | `syllabus.service.ts:15,20,45,50,55,106-124`; SyllabusTab, `/syllabus` | academics:view / teaching:view | writes: S_WRITE; `approve` :130, `DELETE :id` :125 = E11 |
| 8 | `GET /assessments` :56, `:id` :195, `marks/list` :80, `marks/summary` :86; `POST /assessments/marks/bulk` `assessment.controller.ts:349`; `PATCH marks/verify` :356; `PATCH report-cards/:id/remarks` :120; `GET/POST quiz-attempts*` :166-178 | `assessment.api.ts:29,32,156-165,177,147-153`; `pages/assessments/index.tsx:309-330,828`; `hooks/useAssessments.ts:127` | assessments:view (incl. student, parent); manage incl. teacher | writes `marks/bulk`, `marks/verify`, remarks, quiz grade: reuse `QUESTION_BANK_EDITOR_ROLES` (already defined `assessment.controller.ts:29-33`). `report-cards/generate|publish` :114,:130 and assessment create/update/delete/status :201-232: admin-ish, flag. |
| 9 | `/teaching/behaviour` GET :189, POST :192, PATCH :195; `/behaviour/records` GET `behaviour.controller.ts:41`, POST :53, PUT :64, `PATCH :id/resolve` :70, `GET students/:studentId/profile` :80, `tarbiyah` GET :91, POST :107, PUT :130 | `teaching.service.ts:98-100`; `behaviour.api.ts:28-37,40-46,85`; BehaviourTab | behaviour:view (incl. student, parent); manage incl. teacher | writes: S_WRITE |
| 10 | `GET /students` `students/students.controller.ts:54`, `GET :id` :147, `GET :id/360` :154, `GET filters/grades-sections` :61 | `students.service.ts:13,17,85`; `students.api.ts:26-32`; `hooks/useStudents.ts:39`; /students, /students/:id | students:view | OPEN (parent role has students:view on web; scoping is a Part-B item) |
| 11 | `/teaching/ptm` GET :16, dashboard :11, `upcoming/mine` :21, `student/:id/history` :29, `:id` :34, POST :39, `PATCH :id/confirm|reschedule|outcome|action-items|cancel` :44-67 | `teaching.service.ts:119-130`; PTMTab | teaching:view | writes: S_WRITE |
| 12 | `GET /teaching/fixtures` `substitution.controller.ts:39`, `PATCH :id/complete` :34 | `teaching.service.ts:107,114`; FixturesTab | teaching:view | `complete`: S_WRITE; `generate-for-absence` :11, `assign` :24, `cancel` :29 = E11 candidates |
| 13 | `GET /hr/leave/self/balance` `hr.controller.ts:239`, `GET leave/self/history` :243, `POST leave/self` :247 | `hr.service.ts:128-130`; `pages/my-leave/index.tsx:181,186` | `leave:self` = teacher (+ custom role granting it) | ALREADY guarded: `@RequirePermission('leave:self')` (matrix: TEACHER only + super_admin). Caveat: a custom-role user with a primaryRole that lacks `leave:self` in `PERMISSIONS_MATRIX` gets 403 even though web `permissions` may allow it - no change, pre-existing. |
| 17 | `GET /school-calendar/events` `school-calendar.controller.ts:30`, `circulars` GET :59,:65, `POST circulars/:id/acknowledge` :105, `GET acknowledgment-status` :99; `GET /events` `events/events.controller.ts:19`, `:id` :31, `:id/attendees` :218 | `pages/school-calendar/api.ts:8-26`; `pages/events/api.ts:7-8,58` | calendar/events view = all but viewer | reads/acknowledge OPEN. Calendar writes ALREADY `@Roles(...CALENDAR_ADMIN_ROLES)` :36-92. `events` write routes (POST/PATCH/DELETE :25,:37,:43,... orders, refunds, campaigns, badges) unguarded; web events:manage = SA, owner, admin, principal, finance_officer; not teacher-app-needed -> flag. |
| 18 | `GET /academics/curriculum` `modules/academics/academics.controller.ts:111`, `:id` :123, `GET library/*` :143-272 | `academics.service.ts:34-48`; `pages/academics/library/api.ts` | academics:view | OPEN. Writes (curriculum POST :116, PATCH :128, `slo` :133, subjects/categories/groups, library issue/return) unguarded; not app-needed. |
| 19 | `/ece/*` e.g. `GET dashboard` `ece/ece.controller.ts:365`, `children` :360, `observations` GET :113, POST :118, `quick` :124, `students/:id/profile` :131, `portfolio` :144,:161,:166, `weekly-plan` :199, :209 | `services/ece.service.ts:25-122` | early-years:view = SA, owner, admin, principal, teacher | reads OPEN; observation/portfolio/weekly-plan writes S_WRITE (+ web early-years:manage includes teacher). Framework/domain/skill/indicator/age-band/seed writes (:38-70, :80-108, :221-231 etc.) are admin config: candidates for TEACHING_ADMIN-style guard, flag only. |
| 20 | `POST /compliance/safeguarding` `compliance/compliance.controller.ts:112-113` | `services/compliance.api.ts:31` via `hooks/useCompliance.ts:61` (Governance page, `governance:view`: SA, owner, admin, principal) | teacher cannot reach on web, backend allows | ALREADY `@RequirePermission('safeguarding:report')` (matrix includes teacher, all staff roles; excludes parent/student). No change. `GET safeguarding` :101 and `PUT/POST note` :120,:127 already `safeguarding:read/write`. |
| 21 | `POST /upload/single/:folder` `upload/upload.controller.ts:20`, `multiple` :33, `DELETE` :46, `GET signed-url` :52; `GET /kb/articles` `modules/knowledge-base/knowledge-base.controller.ts:23`, `search` :29, `articles/:module/:tabKey` :35; `GET/PATCH auth/me` avatar | `components/ui/FileUpload.tsx:83,226`; `HomeworkTab.tsx:94`; `ece.service.ts:6`; `services/kb.service.ts:26-39` | upload: any page with an attachment; KB read: any authenticated | OPEN. KB writes already `@Roles(SUPER_ADMIN)` (:42-56) and seed `SUPER_ADMIN, INSTITUTION_OWNER` (:73). Upload `DELETE` unguarded (flag). |

---------------------------------------------------------------------------------------------------
## 4. Recommended guard design (additive, no behaviour change for allowed roles)

### 4.1 Role sets (superset = union of web "manage" holders AND backend `PERMISSIONS_MATRIX` write holders, so nobody who legitimately works today is dropped)

| Constant | Roles | Why |
|---|---|---|
| `TEACHING_ADMIN` (E3-E10) | `SUPER_ADMIN, INSTITUTION_OWNER, PRINCIPAL, VICE_PRINCIPAL, ADMIN, ACADEMIC_COORDINATOR` | web `teaching:manage` = SA, owner, admin, principal; backend matrix `teaching:write` adds VP and academic_coordinator (which web cannot use anyway without a custom role, but backend matrix intends them). Excludes `teacher`, `hr_manager`, `finance_manager`, `librarian`, `support_staff`, `parent`, `student`, resellers. |
| `HR_LEAVE_ADMIN` (E1, E1b) | `SUPER_ADMIN, INSTITUTION_OWNER, PRINCIPAL, ADMIN, HR_MANAGER` | web reach = `hr:view` = SA, owner, admin, principal (+hr_officer, not a backend role); matrix `hr:write` = owner, principal, admin, hr_manager. `principal` has hr:view only on web but can click Approve today, so keep. |
| `MODULES_ADMIN` (E2) | `SUPER_ADMIN, INSTITUTION_OWNER, ADMIN` (strict = web `apps:manage`). If owner wants zero regression for principals: add `PRINCIPAL` (web `apps:view` + no in-page check). | |
| `S_WRITE` (optional Tier 2; teacher-needed writes) | = existing `QUESTION_BANK_EDITOR_ROLES` (`assessment.controller.ts:29-33`): `SUPER_ADMIN, INSTITUTION_OWNER, PRINCIPAL, VICE_PRINCIPAL, ADMIN, ACADEMIC_COORDINATOR, TEACHER`. Should be hoisted to a shared file (e.g. `auth/role-sets.ts`) and exported with the others. Only blocks parent/student/finance/hr/librarian/support/reseller tokens. | If any school's non-teaching staff (e.g. `support_staff` marking attendance) legitimately write today, add them or skip Tier 2 for that route. |

### 4.2 Why plain `@Roles` is NOT sufficient alone (and the custom-role trap)
- `RolesGuard` only sees `primaryRole`. Staff default to `teacher` (`hr.service.ts:233`) and the web grants them whatever their custom role says. A coordinator logged in as `teacher` + custom role "Timetable In-charge: teaching:manage" works on web today and would 403 under `@Roles(TEACHING_ADMIN)`.
- But a naive fallback "custom role grants `teaching:manage`" re-opens the hole for the seeded system-default custom role **"Teacher"** (which has `teaching: manage` module-wide, `roles.service.ts:13-20`).

Recommended compromise (decide with owner): fallback honours a custom role only when it grants `manage` on a SPECIFIC sub-module entry (`subModuleKey` set, e.g. `teaching/timetable`, `teaching/teachers`, `hr/...`) or module-wide manage on a module other than the default Teacher grant; module-wide `teaching:manage` held by the stock "Teacher" role is NOT honoured. Because that would still lock out hand-made module-wide-`teaching:manage` custom roles, **run the pre-flight query below before deploying** and migrate any hits (give them a sub-module grant or primaryRole `academic_coordinator`).

Pre-flight (Mongo, read-only): find logins that would lose access:
```js
// users whose primaryRole is NOT in the allow list but whose custom role has manage on the module
const roles = db.roles.find({ moduleAccess: { $elemMatch: { moduleKey: 'teaching', level: 'manage' } } }, { _id: 1, name: 1, isSystemDefault: 1 }).toArray();
db.users.find({
  customRoleId: { $in: roles.map(r => r._id) },
  primaryRole: { $nin: ['super_admin','institution_owner','principal','vice_principal','admin','academic_coordinator'] },
  isActive: true,
}, { email: 1, primaryRole: 1, customRoleId: 1, schoolSlug: 1 })
```
Repeat for `moduleKey:'hr'` with the HR set, and `'apps'` with the modules set.

### 4.3 Exact code (all additive; nothing existing is edited except adding decorators to routes)

**Option A - simplest, uses only what exists (ship this if the pre-flight returns zero rows):**
```ts
// auth/role-sets.ts (new)
import { UserRole } from './roles.enum';
export const TEACHING_ADMIN_ROLES = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.VICE_PRINCIPAL, UserRole.ADMIN, UserRole.ACADEMIC_COORDINATOR,
];
export const HR_LEAVE_ADMIN_ROLES = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.ADMIN, UserRole.HR_MANAGER,
];
export const MODULES_ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN];

// modules/teaching/teaching.controller.ts  (method level; handler metadata overrides class, so each method needs its own)
import { Roles } from '../../auth/decorators';
import { TEACHING_ADMIN_ROLES } from '../../auth/role-sets';

  @Roles(...TEACHING_ADMIN_ROLES)
  @Post('teachers')
  createTeacher(...) { ... }
// same one-line @Roles(...TEACHING_ADMIN_ROLES) above: PATCH teachers/:id, DELETE teachers/:id, POST teachers/sync,
// PATCH lesson-plans/:id/approve, PATCH lesson-plans/:id/reject, POST/PATCH/DELETE timetable, electives, duty-roster,
// rooms, period-templates (+ seed-default); and on timetable-variant.controller.ts generate/publish/DELETE.

// modules/hr/hr.controller.ts
  @Roles(...HR_LEAVE_ADMIN_ROLES)
  @Patch('leave/:id/status')
  updateLeaveStatus(...) { ... }
// plus POST leave, POST leave/balances/allocate, leave/policies POST/PATCH/assign/bulk-assign/seed-defaults

// modules/modules.controller.ts  (keep existing @UseGuards(JwtAuthGuard))
  @Roles(...MODULES_ADMIN_ROLES)
  @Post(':moduleId/activate')   // and deactivate, bulk-activate, activate-all
```
`RolesGuard` is already global (`app.module.ts:116`) so no module wiring is needed; `@Roles` is typed `UserRole[]` and compares the lowercase JWT role string.

**Option B - role list OR custom-role grant (use if pre-flight finds custom-role admins):** one new decorator + one new global guard registered in `RolesModule` next to `CustomRoleGuard` (it already has the `Role` and `User` models):
```ts
// roles/decorators/roles-or-module-manage.decorator.ts (new)
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../auth/roles.enum';
export const ROLES_OR_MODULE_KEY = 'rolesOrModuleManage';
export interface RolesOrModuleManage { moduleKey: string; roles: UserRole[]; level: 'view' | 'manage'; }
export const RolesOrModuleManage = (moduleKey: string, roles: UserRole[], level: 'view' | 'manage' = 'manage') =>
  SetMetadata(ROLES_OR_MODULE_KEY, { moduleKey, roles, level } as RolesOrModuleManage);

// roles/guards/roles-or-module-manage.guard.ts (new)
@Injectable()
export class RolesOrModuleManageGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = this.reflector.getAllAndOverride<RolesOrModuleManage>(ROLES_OR_MODULE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!req) return true;                                   // no metadata -> no-op, like CustomRoleGuard
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) return true;                                  // JwtAuthGuard handles unauthenticated
    const role = (user.role || user.primaryRole) as UserRole;
    if (req.roles.includes(role)) return true;               // 1) superset of standard roles
    const u = await this.userModel.findById(user.userId).select('customRoleId').lean();
    if (u?.customRoleId) {                                   // 2) school custom role fallback (DB, not JWT)
      const r = await this.roleModel.findById(u.customRoleId).select('moduleAccess').lean();
      const ok = (r?.moduleAccess || []).some((m: any) =>
        m.moduleKey === req.moduleKey && !!m.subModuleKey &&           // sub-module grants only (see 4.2)
        (req.level === 'view' || m.level === 'manage'));
      if (ok) return true;
    }
    throw new ForbiddenException(`Access denied. Requires one of: ${req.roles.join(', ')} or a custom role with ${req.level} access to ${req.moduleKey}.`);
  }
}
// roles/roles.module.ts providers: RolesOrModuleManageGuard, { provide: APP_GUARD, useExisting: RolesOrModuleManageGuard }
// usage:
  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)            @Post('teachers')
  @RolesOrModuleManage('hr', HR_LEAVE_ADMIN_ROLES, 'view')           @Patch('leave/:id/status')   // 'view' = zero-regression for custom roles (web gates at hr:view)
  @RolesOrModuleManage('apps', MODULES_ADMIN_ROLES)                  @Post(':moduleId/activate')
```
The existing `RolesGuard` ignores the new metadata key, so there is no interaction; the existing `CustomRoleGuard` is unaffected. Cost: 1-2 indexed Mongo reads only on decorated, non-allow-listed calls.

### 4.4 Test checklist
1. teacher JWT -> 403 on E1-E10; admin/owner/principal -> 2xx exactly as before. 2. teacher + custom role with sub-module `teaching/timetable manage` -> allowed under Option B. 3. teacher + stock "Teacher" custom role -> 403 on E3-E10 (by design). 4. `GET` counterparts (`teachers`, `rooms`, `timetable/teacher/:staffId`, `modules`, `modules/summary`) still 200 for teacher. 5. `POST hr/leave/self` still 200 for teacher; own-leave approve returns 403 (self-approval fix). 6. parent/student token -> 403 on every guarded write.

### 4.5 Related cautions
- `ModulesController` reads `x-school-slug` header before the JWT slug (`modules.controller.ts:14-44`): any token can target another school's slug; adding `@Roles` does not fix cross-tenant activation. Recommend `req.user.schoolSlug` first in a follow-up.
- Because `AuthGuard('jwt')` is repeated as class-level `@UseGuards` on teaching/hr/academics/exam controllers, it runs in addition to the global guards; harmless, but `request.user` is already set by the time the global `RolesGuard` runs.
- After login the JWT is frozen 7 d; a role/customRole change does not reach `@Roles` (JWT role) until re-login; the Option B DB fallback is live.
