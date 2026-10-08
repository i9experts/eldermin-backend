# Hardening backlog (NOT done in Phase 1)

Found during Phase 0/1 audits. Deliberately out of scope per "minimal, additive" instruction. Source detail: `guard-inventory.md`, audit Parts A/B.

## Critical (recommend next)
1. **`/roles` create/update/assign unguarded** (`roles/roles.controller.ts` POST `/roles`, PUT `/roles/:id`, POST `/roles/assign`): any authenticated user can create a role and assign it to themselves. Web gates `/roles` with `institution:manage` (super_admin, institution_owner, admin).
2. **Nearly all of `/hr/*` unguarded** except `leave/self*`: staff PATCH, `staff/:id/reset-password`, `staff/:id/create-login`, payroll runs/payslips/payments.
3. **`ModulesController` trusts `x-school-slug` header over the JWT slug** (cross-school module targeting).
4. **Custom roles are not evaluated server-side for these routes.** `RolesGuard` only sees `primaryRole`; custom `user.permissions` are login-response only. The stock "Teacher" custom role carries module-wide `teaching:manage`. See "Custom-role decision" in the phase report.
5. **Marks entry integrity:** ~~`POST /assessments/marks/bulk` no `verified` lock, accepts marks > total~~ FIXED for role `teacher`; ~~`PATCH report-cards/:id/remarks` open to any staff token~~ FIXED for teacher; ~~quiz-attempt grading unscoped~~ FIXED for teacher. Still OPEN: marks/bulk has no subject/class/campus ownership check for teachers; non-teacher roles unchanged by design. See "Phase 6 fixes and candidates" below.
6. **Student data scoping:** `GET /students` is campus-scoped only (not class-scoped); `GET /students/:id` and `/:id/360` have no campus/class check (OPEN). ~~list and 360 payloads include fee data, guardian phones, national ids, income~~ FIXED for role `teacher` (B5, `teacher-student-projection.util.ts`; see `PHASE6_FIXES.md` Item 1 for the deny-list and the OWNER DECISION list of fields still returned: guardian email, DOB, address, medical detail, documents).
7. **Student attendance scope:** teachers without a class-teacher assignment pass `resolveClassSectionScope` unrestricted; `studentId` in attendance writes is not checked against the class. Web sends `date=` which the DTO strips (use `from`/`to`).
8. **Student leave (parent-portal) GET/POST accept any studentId from any staff token.**
9. **`POST /compliance/safeguarding` spreads the request body into the case (mass-assignment).** The app whitelists fields client-side; server should too.

## Medium
- `DELETE /upload` has no ownership check.
- `GET /school-calendar/events` leaks fee-due totals to every role.
- `GET /teaching/timetable/teacher/:staffId` ignores `splitGroups` and returns whole-class documents.
- `GET /teaching/dashboard` is campus-wide counts (not per-teacher).
- Assignments: ~~`teacherId` taken from request body~~ FIXED for the teacher role (see "Trusts-body-identity route audit" below). Still open for non-teacher roles by design, and grade-submission has no ownership check.
- Unguarded admin-ish routes (same family as E3-E10, not on the owner's list): `/teaching/exams` writes, `PATCH /syllabus/:id/approve`, `DELETE /syllabus/:id`, `slo-templates` writes, fixtures `generate-for-absence` / `assign` / `cancel`, ECE framework/domain/skill/indicator/age-band/seed config writes, academics curriculum/subjects/library writes, `/events` writes (orders, refunds, campaigns, badges), assessment create/update/delete/status (still OPEN), ~~`marks/verify`, `report-cards/generate|publish`~~ FIXED (B4, admin roles only; teacher 403).
- Behaviour has three unreconciled stores (`teaching/behaviour`, `behaviour/records`, `students/behaviour`); teacher app uses `behaviour/records`.
- No rate limiting/throttling anywhere (login included). JWT is 7 days with no refresh/revocation; `activeModules`/campus/class-teacher are frozen in the token until re-login.
- Web: separate axios instances without a 401 handler (students, assessment, behaviour, compliance); web login 401 triggers global hard-reload.
- Web home dashboard defaults to the `owner` view for everyone with a free role picker (fires finance/admissions queries).
- Reset-password email links to `https://app.eldermin.com/reset-password` only; mobile deep link/app link needs a web-side change or universal-link config.

## Push (deferred by decision)
- `firebase-admin` + sender service, per-event push using `staff_device_tokens` (stored since Phase 1), iOS APNs/Android channel config. Parent app has only `firebase_core` today (no `firebase_messaging`, no `Firebase.initializeApp`).

## Trusts-body-identity route audit (teacher role)

Fixed on `feat/staff-portal` for **role `teacher` only**; every other role (principal, admin, coordinator...) behaves exactly as before. Helper: `src/staff-portal/teacher-identity.util.ts` resolves `{staffId, teacherProfileId, name}` from the DB via `Staff.userId` (JWT `staffId`/`teacherProfileId` claims are NOT trusted). Rule for teacher-owned ids: body id absent -> my `Staff._id`; equals my `Staff._id` or my `TeacherProfile._id` (the web sends either) -> normalised to `Staff._id` (the schema semantic: `Assignment.teacherId` refs Staff, `assignment.schema.ts:10`); anything else -> 403. Teacher with no active Staff record -> 403. Ownership of existing docs accepts either id (legacy rows may hold a TeacherProfile id); a doc with a null/other `teacherId` is 403 for a teacher.

| Route | Trusted body identity before? | Teacher app calls it? | Action | file:line |
|---|---|---|---|---|
| POST `/teaching/assignments` | yes: `teacherId` | yes | FIXED (derive/normalise/403 'You can only create assignments for yourself') | teaching.service.ts `createAssignment`; teaching.controller.ts:198 |
| PATCH `/teaching/assignments/:id` | partly: DTO already strips `teacherId`, but no ownership check | yes | FIXED: teacher must own it (403); cannot reassign teacherId | teaching.service.ts `updateAssignment`; controller:202 |
| DELETE `/teaching/assignments/:id` | no identity input, but no ownership check | yes | FIXED: teacher must own it (403) | `deleteAssignment`; controller:206 |
| PATCH `/teaching/assignments/:id/submissions/:sid` (grade) | no: `gradedBy` from JWT `userId` | yes | VERIFIED, unchanged. No ownership check left (substitute/co-teachers); see Left below | teaching.service.ts:1044,1054 |
| POST `/teaching/lesson-plans` | yes: `teacherId` | not yet | FIXED, same rule (403 'You can only create lesson plans for yourself') | `createLessonPlan`; controller:64 |
| PATCH `/teaching/lesson-plans/:id` | yes: raw `$set` (teacherId, tenantId, campusId...) | not yet | FIXED for teachers: must own plan; `tenantId/institutionId/campusId` stripped; `teacherId` may only restate me | `updateLessonPlan`; controller:82 |
| POST `/behaviour/records` | yes: `reportedBy` from body, `reportedById` from body (never set server-side) | yes | FIXED for teachers: `reportedBy` overridden with the JWT name (display field); `reportedById` must be my `userId` or absent (else 403) and is always stored as my `userId` (schema: ref User, `behaviour.schema.ts:97`) | behaviour.controller.ts:57-65; `applyTeacherAuthorship` |
| PUT `/behaviour/records/:id` | yes: raw `$set` | not yet | FIXED for teachers: `reportedBy/reportedById/schoolSlug/campusId/verifiedBy` stripped from the body. No record-ownership check (web staff edit shared records; name-only legacy rows cannot be matched reliably) | behaviour.controller.ts:69-77 |
| POST `/teaching/ptm` | yes: `teacherId` | not yet | FIXED, same rule (403 'You can only create meetings for yourself') | ptm.service.ts `createMeeting`; ptm.controller.ts:42 |
| PATCH `/teaching/ptm/:id/reschedule`, `/:id/outcome` | no identity input, no ownership check | not yet | FIXED: teacher must own the meeting (403) | ptm.controller.ts:54,60 |
| PATCH `/teaching/ptm/:id/confirm`, `/:id/cancel`, `/:id/action-items/:aid` | no ownership check | not yet | LEFT (see below) | ptm.controller.ts:48,67,75 |
| POST `/students/attendance/bulk` | no: `markedBy` overwritten from JWT name (and not stored per the audit) | yes | VERIFIED, unchanged | students/students.controller.ts:477-480 |
| POST `/assessments/marks/bulk` | no: `enteredBy` overwritten from JWT name after the body spread | not yet | VERIFIED, unchanged (integrity gaps tracked in Critical #5) | assessments/assessment.controller.ts:350-355 |
| PATCH `/syllabus/:id/mark-topic`, `/mark-sub-topic` | no identity input (path id + unit/topic numbers) | not yet | VERIFIED, no body identity; no ownership check (LEFT) | syllabus.controller.ts:140,146 |
| POST `/syllabus`, PUT `/syllabus/:id` | yes: `teacherId`, `teacherName` in body DTO | not yet | LEFT | syllabus.dto.ts:68-69,88-89; controller:116,122 |
| PATCH `/teaching/fixtures/:id/complete` (substitution) | no identity input; no ownership check | not yet | LEFT | substitution.controller.ts:37; service `completeFixture` |
| POST `/parent-portal/students/:studentId/leave` | studentId from path, `requestedBy` from JWT | no (app uses `/staff-portal` student-leave review) | VERIFIED; any-studentId issue already Critical #8 | parent-portal.controller.ts:206 |
| POST/PATCH `/teaching/behaviour` (old store) | yes: `reportedBy` (Staff ref) from raw body | no (app uses `behaviour/records`) | LEFT | teaching.controller.ts:225,229; teaching.service.ts:1125,1139 |

### Follow-up fix: teacher self-approval via lesson-plan create/PATCH
`POST /teaching/lesson-plans` and the raw-`$set` `PATCH /teaching/lesson-plans/:id` let a teacher set `status: 'approved'` (and `approvedBy`/`approvedAt`/`approverNotes`/`rejectionReason`), bypassing the guarded approve/reject routes. FIXED for role `teacher` only: status may only be `draft` or `submitted` (403 otherwise) and the approver-owned fields are stripped (`teaching.service.ts` `sanitizeTeacherLessonPlanApproval`). Other roles unchanged. Found by the Phase 6a audit (lesson-plan PATCH accepts anything).

### Left, and why
- **Grade submission ownership**: gradedBy is already server-side; restricting to the assignment owner would break co-teachers/substitutes and needs a product rule.
- **PTM confirm/cancel/action-items, fixtures complete, syllabus mark-topic**: no body identity is trusted (they act on a path id); the gap is missing ownership/scoping, tracked here rather than changed because the teacher app does not call them yet and the rules (substitutes, HODs) need a decision.
- **Syllabus create/update `teacherId`/`teacherName`** (syllabus.dto.ts:68-69, 88-89; controller 116/122): same pattern as assignments; not called by the app. Apply `normaliseTeacherIdForWrite` when the app starts using it (note `teacherName` also needs overriding).
- **`/teaching/behaviour` POST/PATCH** (teaching.controller.ts:225,229): old store, raw body spread.
- **Behaviour PUT ownership**, **lesson plan GET/list scoping**, non-teacher roles: unchanged by instruction.
- Teacher accounts with legacy rows whose `teacherId` is null (e.g. auto-spawned syllabus assignments, `Assignment.autoSpawnKey`) can no longer edit/delete those as a teacher (403); coordinators/admins still can.

## Proposals (no code change yet)

### P1. Additive merge of `behaviour_records` into the Student 360 behaviour block
`GET /students/:id/360` builds `behaviourSummary` / `recentBehaviour` only from the students-module `behaviourModel` (collection `student_behaviour`): `src/students/students.service.ts:1517-1531` (aggregate by type for the current year, then `find({studentId}).sort({date:-1}).limit(10)`). The Behaviour module's `BehaviourRecord` (`behaviour_records`, written by `POST /behaviour/records`, what the web Behaviour page, the teacher app and the parent app use; parent read at `src/parent-portal/parent-portal.service.ts:390-396`) is never read, so records logged in the app do not appear in the 360 "Recent behaviour" card. Proposal: add a second query on `behaviour_records` (`{studentId, schoolSlug}`), map to the same shape (`type, title, description, date, points, reportedBy`), concatenate with the existing rows, sort by `date` desc, cap 10, and add the new type counts into `behaviourSummary`. Strictly additive: existing keys and rows unchanged, new rows only appended; no schema change; needs `BehaviourRecord` registered in the students module and a dedupe note (the two stores can hold the same incident if staff logged both). Not changed now.

### P2. `POST /behaviour/records` returns a bare 500 on a malformed body
`BehaviourController.createRecord` takes `@Body() dto: any` (`src/behaviour/behaviour.controller.ts:59`) and `BehaviourService.createRecord` does `new this.recordModel({...}).save()` with no try/catch (`src/behaviour/behaviour.service.ts:159-168`; `new Types.ObjectId(data.studentId)` and `new Date(data.date)` also throw on junk). A Mongoose ValidationError/CastError therefore surfaces as HTTP 500 (the app works around it by pre-validating). Proposal: a `CreateBehaviourRecordDto` (class-validator: `studentId` IsMongoId, `date` IsDateString, `type` IsEnum, `category`, `title`, `description`, `severity`, `points` IsNumber, optional follow-up/parent-communication fields) so the global ValidationPipe (`main.ts:70`, `whitelist: true`) returns 400, plus a try/catch mapping `ValidationError`/`CastError` to `BadRequestException` as `teaching.service.ts` already does for assignments. The same applies to `PUT records/:id` (`behaviour.controller.ts:69`, raw `$set`).

### P3. Remaining trusts-body-identity routes
See the "Left" list above: `POST /syllabus` / `PUT /syllabus/:id` (syllabus.dto.ts:68-69, 88-89; syllabus.controller.ts:116,122), `POST/PATCH /teaching/behaviour` (teaching.controller.ts:225,229; teaching.service.ts:1125,1139), PUT behaviour records ownership (behaviour.controller.ts:69-77), PTM confirm/cancel/action-items (ptm.controller.ts:48,67,75), fixtures complete (substitution.controller.ts:37), syllabus mark-topic/sub-topic (syllabus.controller.ts:140,146), grade submission ownership (teaching.service.ts:1044).


## Phase 6 fixes and candidates (marks, remarks, quiz, library, curriculum)

Source: `PHASE6B_REPORT.md` (section 7 candidates) plus the Phase 6 fixes on `feat/staff-portal` (`PHASE6_FIXES.md`). FIXED (teacher role) = enforced only when the caller's role is `teacher` (`isTeacherCaller`); every other role behaves exactly as before. Line numbers are of the current branch (after the rebase onto origin/main `e2486db`).

| # | Item | Status | Where |
|---|---|---|---|
| 1 | `POST /assessments/marks/bulk`: marks > subject total or negative accepted | FIXED (teacher): 400 listing rows; DTO already has `@Min(0)` for all roles but no upper bound | `assessment.service.ts` `bulkEnterMarks` |
| 2 | `marks/bulk` overwrites `verified` marks (and the `$set` omits `verified`, so a verified row stays verified after overwrite) | FIXED (teacher): any verified row rejects the whole request (409, nothing written). OPEN for admin roles (they still overwrite) | same |
| 3 | `marks/bulk` stale `percentage`/`grade_result`/`gpa` when a scored row becomes absent/exempt (Mongoose 9 strips `undefined` keys from `$set`; proven with `_castUpdate`) | FIXED (teacher): explicit nulls. OPEN for other roles | same |
| 4 | `marks/bulk` has no ownership / subject-class / campus / status scoping for teachers (any teacher can write any assessment's marks) | OPEN (needs the same string-matching decision as the app's "my assessments") | same |
| 5 | `marks/bulk` row with `obtainedMarks: null` and neither absent nor exempt is stored as 0% (null/total) | OPEN (note only; the app never sends it) | same |
| 6 | `PATCH /assessments/report-cards/:id/remarks`: any staff token; `principalRemarks` writable by anyone | FIXED (teacher): must be class teacher of the card's grade/section (403), only `classTeacherRemarks` writable | `updateReportCardRemarks` |
| 7 | Remarks: unknown id answers 200 with an empty body | FIXED (teacher: 404). OPEN for admin roles (200-empty quirk kept on purpose) | same |
| 8 | Remarks: published cards remain editable | OPEN (all roles; needs a product rule) | same |
| 9 | `POST quiz-attempts/:id/grade`: no per-question bounds | FIXED (teacher): 0..question marks, 400 listing questions | `gradeQuizAttempt` |
| 10 | Quiz grade: re-grade of an already graded attempt | FIXED (teacher: 409). OPEN for admins (they may re-grade) | same |
| 11 | Quiz completion overwrote ANY existing MarkEntry (verified or manual) | FIXED for ALL roles (data-integrity bug): never overwrites verified or manually entered entries; only quiz-written entries (`quizAttemptId` marker or legacy `enteredBy: 'Online Quiz (auto)'`) are updated | `upsertMarkEntryFromAttempt` |
| 12 | Quiz grade: any teacher could grade any attempt | FIXED (teacher): must teach the attempt's class (403). Added beyond the original ask, same helper as #13 | `gradeQuizAttempt` |
| 13 | `GET /assessments/quiz-attempts` (+ `/:attemptId`) school-wide, incl. answer keys | FIXED (teacher): class teacher = all subjects of own class, subject teacher = assigned class+subject, union for both (refined from class-only, `PHASE6_FIXES.md` Item 3); detail/grade 403 outside. OPEN for other roles (school-wide as today) | `getQuizAttemptsPendingReview`, `getQuizAttemptForReview` |
| 14 | `GET /assessments` is campus-scoped only (not teacher-scoped) and `limit` has no maximum (`PaginationDto.limit` only `@Min(1)`, `assessment.dto.ts:14`) | OPEN | `assessment.service.ts` `findAll`; `assessment.controller.ts` `@Get()` |
| 15 | `GET /assessments/marks/list` is not grade/section scoped (schoolSlug only); rollNumber sorted as a string | OPEN | `getMarks` |
| 16 | `GET /academics/library/books/:id` WRITES on a GET (`ensureCopies` persists inferred copies via `findByIdAndUpdate`) and returns the last 20 issue records (borrower history) | OPEN (the teacher app deliberately does not call it) | `academics.service.ts:531-545` (`getBookById`), `:574-579` (`ensureCopies`); route `academics.controller.ts:175` |
| 17 | `GET /academics/curriculum` is tenant-wide and includes drafts unless the client passes `status` | FIXED (teacher): only `status: 'active'` (list forced, detail 404 otherwise). OPEN for other roles by design (tenant-wide incl. drafts) | `academics.service.ts:387-395`; route `academics.controller.ts:111` |
| 18 | `GET /academics/library/search` is `$text` on `tenantId` only (no campus scope), 20 rows | OPEN | `academics.service.ts:699-705`; route `academics.controller.ts:160` |
| 19 | JWT carries no `academicYear` (the app sends `x-academic-year`; the controller falls back to a hard-coded `'2025-26'`) | OPEN | `jwt.strategy.ts`; `assessment.controller.ts` `ctx()` |
| 20 | Non-atomic `marks/bulk` (`bulkWrite` is ordered; a mid-batch failure leaves a written prefix) | OPEN (note) | `bulkEnterMarks` |
| 21 | MarkEntry/quiz upsert read-then-write is not atomic (a manual entry created between the check and the upsert could be overwritten; unique index prevents duplicates) | OPEN (narrow race, noted) | `upsertMarkEntryFromAttempt` |
| 22 | Assessment status gate (marks only while `ongoing`/`completed`) is app-side only | OPEN (product question 1 in PHASE6B_REPORT) | - |
| 23 | B4: `PATCH marks/verify`, `POST report-cards/generate|publish` open to any token | FIXED (all non-admin roles incl. teacher get 403; admin set only, sub-module custom-role grants) | `assessment.controller.ts` |
| 24 | B5: student list/detail/360/PTM fee, guardian phone, national id, income fields | FIXED (teacher): shared deny-list projection, no fee reads, fee list/statement 403 | `students/teacher-student-projection.util.ts` |
| 25 | Student list/detail/360 are not class/campus scoped for teachers; `/students/:id/medical|notes|documents`, `profile-pdf`, `reports/*` unprojected | OPEN | `students.controller.ts` |
| 26 | Web shows Verify/Generate/Publish to teachers (`assessments:manage` includes teacher) | OPEN (web follow-up; the calls now 403) | web |

### Remaining OPEN after this round (summary)
Critical #1 `/roles`, #2 `/hr/*`, #3 ModulesController slug header, #4 custom roles server-side, #7-#9; B3 marks/bulk class/subject scope (#4 above), B6 `?teacherId=` on PTMs/assignments/plans, B7 behaviour campusId visibility, B8 attendance multi-class scope; student class scoping (#25); items #5, #8, #14-#16, #18-#22 above; assessment create/update/delete/status unguarded; the OWNER DECISION field list in `PHASE6_FIXES.md`.
