# Phase 6 fixes: marks, remarks and quiz hardening (branch `feat/staff-portal`)

All four fixes are enforced for role `teacher` only (`isTeacherCaller` from `src/staff-portal/teacher-identity.util.ts`), with the single deliberate exception of the MarkEntry provenance guard (c), which protects data for every role. Principal, admin, institution_owner, vice_principal, academic_coordinator, super_admin (and any other non-teacher role) behave exactly as before; each fix has tests proving that. Teacher identity is always resolved from the DB (`Staff.userId` -> `Staff` -> `TeacherProfile`), never from JWT claims; a teacher with no active Staff record gets 403. Class matching uses `class-match.util.ts` (`Grade 5` = `5` = `g5`, case/space tolerant; a section is compared only when the assignment has one). Code: `src/assessments/assessment.service.ts`, controller passes `req.user`. Tests: `src/assessments/*-teacher.spec.ts` (fakes only, no DB; helper `assessment-test-fakes.ts`).

New wiring: `AssessmentModule` registers the `Staff` and `TeacherProfile` models; `AssessmentService` takes them as two new constructor models. New shared helper `teacherClassesOf(profile)` (class-teacher class + `currentAssignments`). Additive schema field `MarkEntry.quizAttemptId` (no index, no migration).

## (a) POST /assessments/marks/bulk
- Teacher: every row is validated first; any `obtainedMarks` outside `0..subject.totalMarks` (matched by subject name in `assessment.subjects`) rejects the whole request with 400 listing the students (name, roll, value). Absent/exempt rows are not range-checked (absent wins, as today).
- Teacher: if any student in the payload already has a `verified` MarkEntry for this assessment+subject, the whole request is rejected with 409 `Marks for N students are verified and locked: ...`. Nothing is written (validate everything, then `bulkWrite`).
- Teacher: for absent/exempt rows `percentage`, `grade_result` and `gpa` are set to `null` explicitly. This was PROVEN stale-able: Mongoose 9.6.3 strips `undefined` keys from `$set` (checked with `Query._castUpdate`), so an earlier score's percentage/grade/gpa survived while `result` flipped to `absent`. Other roles keep the old `$set` (stale values still possible there: OPEN).
- Admin roles: unchanged (overwrite, no total check beyond the DTO's `@Min(0)`, verified rows overwritten).
- Not done: teacher ownership/subject-class scoping of the assessment (OPEN, backlog #4).

## (b) PATCH /assessments/report-cards/:id/remarks
- Teacher: must be the CLASS TEACHER (`isClassTeacher` + `classTeacherOfGradeName/SectionName`) of the card's `grade`/`section` (ReportCard stores both), else 403. Subject teachers and class teachers of other classes get 403.
- Teacher: only `classTeacherRemarks` is written; `principalRemarks` is stripped (a body with only `principalRemarks` writes nothing and returns the card).
- Teacher: unknown or malformed id -> 404 `Report card not found`.
- Admin roles: unchanged, including the 200-empty answer for an unknown id and `principalRemarks` writes. Published-card edits are still allowed for everyone (OPEN).

## (c) POST /assessments/quiz-attempts/:attemptId/grade
- Teacher: must teach the attempt's class (403, added beyond the original ask because (d) scopes reads the same way); a `graded` attempt cannot be re-graded (409); each mark must satisfy `0 <= marksAwarded <= question.marks` (question marks come from the linked exam paper's questions) and must target a manually graded question of the attempt; 400 lists the offending questions. Validated before anything is saved.
- ALL roles (data-integrity fix): `upsertMarkEntryFromAttempt` no longer overwrites an existing MarkEntry blindly. Provenance choice: the MarkEntry now records `quizAttemptId` when written from a quiz. On completion, with no existing entry it inserts (as before); with an existing entry it updates ONLY if the entry is not `verified` AND was written by a quiz (`quizAttemptId` set, or the legacy marker `enteredBy === 'Online Quiz (auto)'` that all previously quiz-written rows carry). Verified entries and manually entered entries are left untouched and a warning is logged; the attempt is still marked graded. A later quiz attempt for the same assessment/subject may still update an earlier quiz-written mark (same source), as before.
- Admin roles: re-grade still allowed, no bounds, no class check (unchanged).
- Known limit: the existence check and the upsert are two operations (narrow race, OPEN #21).

## (d) GET /assessments/quiz-attempts and GET /assessments/quiz-attempts/:attemptId
- Teacher: the `status: submitted` queue is filtered server-side to attempts whose `grade`/`section` (QuizAttempt stores both) are in the teacher's classes (class-teacher class + `currentAssignments`). A teacher with no classes sees an empty list. `GET :attemptId` outside the teacher's classes -> 403 (the detail includes the answer key).
- Other roles: school-wide as today.
- Filtering happens in memory after the existing query (same number of DB reads for other roles; teachers read the school queue server-side but receive only their rows).

## Tests
`marks-bulk-teacher.spec.ts`, `report-card-remarks-teacher.spec.ts`, `quiz-grade-teacher.spec.ts`, `quiz-queue-teacher.spec.ts`: 64 tests (teacher cases, a non-teacher matrix of principal/admin/institution_owner/vice_principal/academic_coordinator/super_admin for each fix, MarkEntry provenance matrix). Full suite after this work: 42 suites / 772 tests.
