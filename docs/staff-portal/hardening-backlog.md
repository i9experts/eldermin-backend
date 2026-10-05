# Hardening backlog (NOT done in Phase 1)

Found during Phase 0/1 audits. Deliberately out of scope per "minimal, additive" instruction. Source detail: `guard-inventory.md`, audit Parts A/B.

## Critical (recommend next)
1. **`/roles` create/update/assign unguarded** (`roles/roles.controller.ts` POST `/roles`, PUT `/roles/:id`, POST `/roles/assign`): any authenticated user can create a role and assign it to themselves. Web gates `/roles` with `institution:manage` (super_admin, institution_owner, admin).
2. **Nearly all of `/hr/*` unguarded** except `leave/self*`: staff PATCH, `staff/:id/reset-password`, `staff/:id/create-login`, payroll runs/payslips/payments.
3. **`ModulesController` trusts `x-school-slug` header over the JWT slug** (cross-school module targeting).
4. **Custom roles are not evaluated server-side for these routes.** `RolesGuard` only sees `primaryRole`; custom `user.permissions` are login-response only. The stock "Teacher" custom role carries module-wide `teaching:manage`. See "Custom-role decision" in the phase report.
5. **Marks entry integrity:** `POST /assessments/marks/bulk` has no subject/class/campus ownership check, no `verified` lock, accepts marks > total. `PATCH report-cards/:id/remarks` open to any staff token. Quiz-attempt grading unscoped.
6. **Student data scoping:** `GET /students` is campus-scoped only (not class-scoped); `GET /students/:id` and `/:id/360` have no campus/class check; list and 360 payloads include fee data (`monthlyTuitionFee` etc.).
7. **Student attendance scope:** teachers without a class-teacher assignment pass `resolveClassSectionScope` unrestricted; `studentId` in attendance writes is not checked against the class. Web sends `date=` which the DTO strips (use `from`/`to`).
8. **Student leave (parent-portal) GET/POST accept any studentId from any staff token.**
9. **`POST /compliance/safeguarding` spreads the request body into the case (mass-assignment).** The app whitelists fields client-side; server should too.

## Medium
- `DELETE /upload` has no ownership check.
- `GET /school-calendar/events` leaks fee-due totals to every role.
- `GET /teaching/timetable/teacher/:staffId` ignores `splitGroups` and returns whole-class documents.
- `GET /teaching/dashboard` is campus-wide counts (not per-teacher).
- Assignments: `teacherId` taken from request body; no ownership checks on edit/delete/grade submissions. Lesson plan `PATCH :id` is a raw `$set`.
- Unguarded admin-ish routes (same family as E3-E10, not on the owner's list): `/teaching/exams` writes, `PATCH /syllabus/:id/approve`, `DELETE /syllabus/:id`, `slo-templates` writes, fixtures `generate-for-absence` / `assign` / `cancel`, ECE framework/domain/skill/indicator/age-band/seed config writes, academics curriculum/subjects/library writes, `/events` writes (orders, refunds, campaigns, badges), assessment create/update/delete/status, `marks/verify`, `report-cards/generate|publish`.
- Behaviour has three unreconciled stores (`teaching/behaviour`, `behaviour/records`, `students/behaviour`); teacher app uses `behaviour/records`.
- No rate limiting/throttling anywhere (login included). JWT is 7 days with no refresh/revocation; `activeModules`/campus/class-teacher are frozen in the token until re-login.
- Web: separate axios instances without a 401 handler (students, assessment, behaviour, compliance); web login 401 triggers global hard-reload.
- Web home dashboard defaults to the `owner` view for everyone with a free role picker (fires finance/admissions queries).
- Reset-password email links to `https://app.eldermin.com/reset-password` only; mobile deep link/app link needs a web-side change or universal-link config.

## Push (deferred by decision)
- `firebase-admin` + sender service, per-event push using `staff_device_tokens` (stored since Phase 1), iOS APNs/Android channel config. Parent app has only `firebase_core` today (no `firebase_messaging`, no `Firebase.initializeApp`).
