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

---

# Phase 6 follow-up: B5 privacy, B4 guards, quiz subject scope, curriculum drafts

Same rule as above: the restricted role is `teacher` (`isTeacherCaller`); principal, vice_principal, admin, institution_owner, academic_coordinator, super_admin (and any other role) behave exactly as before, proven per item by a role matrix. Fakes only, no DB. One commit per item.

## Item 1. B5: server-side field projection for role teacher (privacy)
Code: `src/students/teacher-student-projection.util.ts` (single shared helper), applied in `students.controller.ts`, `students.service.ts` (`getStudents`, `getStudent360`) and `modules/teaching/ptm.controller.ts`. Tests: `src/students/teacher-student-projection.spec.ts` (44).

**Deny-list** (key names, case-insensitive, at ANY depth, so `guardians[]`, `medical`, `customFields`, arrays of students and PTM rows are covered; copy-based, input never mutated; ObjectId/Date leaves kept):
1. Fees/finance (exact keys): `fees, fee, feeStatus, feeStructure, feePlan, feeDiscount, feeSummary, feeAssignment, recentFees, monthlyTuitionFee, tuitionFee, monthlyFeeArrears, feeArrears, arrears, invoices, invoice, payments, payment, paidAmount, netAmount, outstanding, balance, discount, concession, scholarship, scholarshipHolder, scholarshipDetail`. (Real fields found in code: `monthlyTuitionFee` injected by `getStudents` `dataWithFees`; the 360 `fees{summary,recent}` block from `StudentFee`: amount/discount/fine/netAmount/paidAmount/receiptNumber...; `Student.scholarshipHolder/scholarshipDetail`. `feeStatus`/`monthlyFeeArrears` do not exist in this code but are in the deny-list because the audit saw them on real documents.)
2. Phone numbers (any key containing `phone|mobile|whatsapp|landline|telephone`): `guardians[].phone`, `whatsApp`, `altPhone`, `personalPhone`, `emergencyContactPhone`, `tutorPhone`, `medical.doctorPhone`, PTM `guardianPhone`.
3. National/identity numbers (any key containing `cnic|nationalid|bform|passport|visa`): `nationalId`, `bForm`, `passportNumber`, `visaNo`, `guardians[].cnic`.
4. Income/employment (exact): `monthlyIncome, income, householdIncome, familyIncome, employer, occupation`.

**Also done for the teacher role:** `getStudents` uses a DB-side exclusion `select` (`TEACHER_STUDENT_SELECT`) and skips the three fee queries; the search `$or` drops `guardians.phone` (otherwise search is a phone-number oracle); `getStudent360` uses the same `select` and never reads `StudentFee` (the `fees` block is removed from the payload). `GET /students/fees/list` and `GET /students/:id/fees/statement` answer 403 for teachers (extra, beyond the endpoints the app calls; finance data). Endpoints covered (post-processing in the controller, defence in depth): `GET /students`, `/:id`, `/:id/360`, `/filters/grades-sections`, `/class-roster-diagnostic`, `/:id/learning`, `/:id/attendance/summary`, `/attendance/list`, `/guardians/list`, and all `/teaching/ptm` responses (the meeting row embeds `guardianPhone`/`guardianEmail`). Checked and NOT needing a change: assignment submissions, behaviour records/profile, report cards, marks/list, quiz attempts (they carry only `studentName`/ids, no embedded student document).

**Teacher-app compatibility** (models in `eldermin-teacher-app/lib/core/models/classroom/`): the app parses `student.{_id,studentId,firstName,lastName,preferredName,gender,photo,currentGrade,currentSection,currentRollNumber,grNo,status,currentAcademicYear}`, `student.guardians[].{name,relation,isPrimary}`, `student.medical.allergies`, `attendance.*`, `behaviour.*`, `assessments.recent[]`, `grades/sections`; PTM `guardianName`. None is in the deny-list; tests assert they survive.

**OWNER DECISION list (sensitive-looking, deliberately NOT stripped; say the word to add any of them to the deny-list):**
- Guardian `email` (and PTM `guardianEmail`): the owner ordered phone numbers only. Needed? The app does not read it.
- Student `dateOfBirth`, `dateOfBirthInWords`, `placeOfBirth` (age is useful to teachers).
- Home address: `address, town, city, province, country, postalCode`, permanent address fields.
- Medical beyond allergies: `bloodGroup, medications, conditions, doctorName, doctorClinic, emergencyAction, peRestrictions, dietaryRestrictions, insurance*, specialNeedsDetail` (only `doctorPhone` is removed, by the phone rule). Teachers may legitimately need most of these.
- `documents[]` (names, status, `fileUrl`), `academicHistory[]`, previous school, transfer certificate, `rfid`.
- `emergencyContactName/Relation`, `tutorName`, sibling fields, `familyCode/familyId`, transport route/stop, hostel, `customFields` (school-defined; only deny-listed keys inside are removed), `specialNeeds`, `isGifted`, `isESL`.
- Not restricted at all (OPEN): class/campus scoping of the student list and detail (any campus student is still readable by id, backlog #6); `GET /students/:id/medical|notes|documents|academic-history`, `POST /students/:id/profile-pdf` (full profile PDF) and `GET /students/reports/*` are reachable by teacher tokens and unchanged.

## Item 2. B4: result-publication guards
`PATCH /assessments/marks/verify`, `POST /assessments/report-cards/generate`, `POST /assessments/report-cards/publish` now carry `@RolesOrModuleManage('assessments', TEACHING_ADMIN_ROLES)` (level `manage`, `allowModuleWide` false): super_admin, institution_owner, principal, vice_principal, admin, academic_coordinator pass; a custom role passes only with an `assessments` SUB-module manage grant (the stock Teacher module-wide `assessments:manage` does not); teacher, parent, student get 403 `Access denied. Requires one of: ... or a custom role with manage access to assessments.`
Decisions: `report-cards/publish` is the only result-publication route (`publishResults`); there is no separate `PATCH results publish`. Other ungated routes in the controller (`POST/PUT/DELETE /assessments`, `PATCH /:id/status`, `questions/*`, `papers`, `omr/*`) are untouched (still backlog; the teacher app/web may use some of them).
**Web impact (intended per owner):** `assessments:manage` includes the teacher role in the web permission matrix, so the web may still show Verify/Generate/Publish buttons to teachers; those calls now return 403. Hide them for teachers in the web in a follow-up.
Tests: `src/assessments/result-publication-guards.spec.ts` (39: metadata, each admin role passes, teacher 403 with message, parent/student 403, sub-module grant passes, module-wide and view-only grants denied) and three new rows in `src/auth/role-sets.spec.ts`.

## Item 3. Quiz scope = class teacher OR class+subject (aligns with the app's `isMyAttempt`)
`GET /assessments/quiz-attempts`, `GET /:attemptId`, `POST /:attemptId/grade` for role teacher (`assessment.service.ts` `canTeacherAccessAttempt`): a CLASS teacher (`isClassTeacher` + `classTeacherOfGradeName/SectionName`) sees/grades ALL subjects of their own class; a SUBJECT teacher only attempts whose class AND subject match one of `currentAssignments {gradeLevel, sectionName, subjectName}`; both = union. Grade/section via `class-match.util` (an assignment section is compared only when set), subject trim + case + internal-whitespace-insensitive (`sameSubject`; the app does trim + lowercase). An assignment without `subjectName` grants nothing (class-only access of 5b1244d/7795f1d is gone); a teacher with no classes sees nothing; detail/grade outside scope stay 403 (messages updated). When an attempt has no `section`, it is resolved from the student's `currentSection` (one batched read for the list). Other roles unchanged (no staff lookup). Existing specs updated to give assignments a `subjectName`. Tests: `src/assessments/quiz-scope-subject-teacher.spec.ts` (29).

## Item 4. Curriculum drafts hidden from teachers
`Curriculum.status` enum is `draft | active | archived` (`modules/academics/schemas/curriculum.schema.ts:38`, default `draft`). For role teacher `GET /academics/curriculum` forces `status: 'active'` (a `status=draft` query cannot widen it) and `GET /academics/curriculum/:id` answers 404 for non-active (no existence leak). Other roles tenant-wide incl. drafts as today. Code: `academics.service.ts` `getCurricula`/`getCurriculumById`, controller forwards `req.user`. Tests: `src/modules/academics/curriculum-teacher.spec.ts` (20).

## Totals
Full suite after these four commits: 48 suites / 945 tests, `npm run build` clean.
