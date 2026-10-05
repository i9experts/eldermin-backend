# Guards added (Phase 1)

Branch feat/staff-portal, eldermin-backend. Originally additive `@Roles(...)`; now migrated to `@RolesOrModuleManage` (see Update below). Sets in `src/auth/role-sets.ts`. Line numbers are of the `@Roles` line.

Also: `HrService.updateLeaveStatus` self-approval check (skipped for super_admin/institution_owner), status validation, controller passes `req.user.role`. `QUESTION_BANK_EDITOR_ROLES` now aliases `STAFF_WRITE_ROLES` (same contents). Test: `src/auth/role-sets.spec.ts`.

## Update: Option B mechanism (replaces plain `@Roles` on all 76 guarded routes)

The 76 routes below now carry `@RolesOrModuleManage(moduleKey, ROLE_SET, opts?)` instead of `@Roles(ROLE_SET)`. Sets in `src/auth/role-sets.ts` are unchanged; the `Roles` metadata is no longer on these routes (the global `RolesGuard` is therefore a no-op for them; the new guard is the sole gate). `QUESTION_BANK_EDITOR_ROLES` alias and its pre-existing `@Roles` routes are untouched. The `Line` column in the table below is from the earlier pass (line numbers approximate).

Files: `src/roles/decorators/roles-or-module-manage.decorator.ts`, `src/roles/guards/roles-or-module-manage.guard.ts` (+ spec), `customRoleGrants` in `src/roles/module-access.util.ts`, registered in `RolesModule` as `APP_GUARD useExisting` next to `CustomRoleGuard`.

Semantics of `RolesOrModuleManageGuard`:
1. `@Public` or no metadata: pass (no-op). Metadata but no `request.user`: 403.
2. JWT base role (`user.role || user.primaryRole`) in the list: pass, no DB access.
3. Base role parent / student / reseller_admin / reseller_support: always 403, custom role ignored.
4. Otherwise look up LIVE: `User.customRoleId` -> `Role.moduleAccess` (not from the JWT, so role changes apply without re-login). Pass if the grant matches `moduleKey` at the required level (`manage` implies `view`):
   - admin-set routes (`allowModuleWide` false, default): only an entry WITH `subModuleKey` counts (any sub-module of that module).
   - STAFF_WRITE routes (`allowModuleWide: true`): a module-wide entry or a sub-module entry counts.
5. No custom role, missing role doc, insufficient grant, or any DB error: 403 (fail closed; DB errors are logged and return a "could not be verified" message).

Module keys used: TEACHING_ADMIN -> `teaching` (syllabus approve/delete -> `academics`, the key web gates `/syllabus` on); HR_LEAVE_ADMIN -> `hr` (level `manage`, except `PATCH leave/:id/status` -> `view`, since web gates leave approval at `hr:view`); MODULES_ADMIN -> `apps`; STAFF_WRITE -> students: `students`, teaching/ptm/substitution: `teaching`, syllabus: `academics`, assessments: `assessments`, behaviour: `behaviour`, ece: `early-years` (all with `allowModuleWide: true`). Note `early-years` is not in `ASSIGNABLE_MODULES`, so no custom role can ever grant it; ECE routes are effectively base-role only (matches web, where a custom role cannot grant early-years either).

Intentional limitation: module-wide custom grants are NOT honoured on admin-set routes. The stock seeded "Teacher" role (isSystemDefault) has module-wide `teaching:manage`; honouring module-wide grants would give every such teacher timetable/teacher/room/approval admin rights, i.e. re-open the hole these guards close. Consequence: a hand-made custom role with module-wide `teaching:manage` (or `hr`/`apps`) whose holder has a non-listed base role loses those admin actions until given a sub-module grant (e.g. `teaching/timetable`) or an allowed base role. Run the pre-flight query in `guard-inventory.md` 4.2 before deploying. STAFF_WRITE routes do honour module-wide grants (normal teacher write capability).

Tests: `src/roles/guards/roles-or-module-manage.guard.spec.ts` (fakes only), `src/auth/role-sets.spec.ts` (reads the new metadata key).

| # | File:line | Route | Role set | Reason |
|---|---|---|---|---|
| 1 | src/assessments/assessment.controller.ts:117 | PATCH /report-cards/:id/remarks | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 2 | src/assessments/assessment.controller.ts:176 | POST /quiz-attempts/:attemptId/grade | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 3 | src/assessments/assessment.controller.ts:348 | POST /marks/bulk | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 4 | src/syllabus/syllabus.controller.ts:127 | DELETE /:id | TEACHING_ADMIN_ROLES | E11 syllabus delete |
| 5 | src/syllabus/syllabus.controller.ts:133 | PATCH /:id/approve | TEACHING_ADMIN_ROLES | E11 syllabus approve |
| 6 | src/syllabus/syllabus.controller.ts:139 | PATCH /:id/mark-topic | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 7 | src/syllabus/syllabus.controller.ts:145 | PATCH /:id/mark-sub-topic | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 8 | src/syllabus/syllabus.controller.ts:157 | POST /:id/lessons | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 9 | src/syllabus/syllabus.controller.ts:164 | PATCH /:id/lessons | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 10 | src/syllabus/syllabus.controller.ts:170 | DELETE /:id/lessons | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 11 | src/syllabus/syllabus.controller.ts:176 | PATCH /:id/publish | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 12 | src/students/students.controller.ts:472 | POST /attendance | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 13 | src/students/students.controller.ts:484 | POST /attendance/bulk | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 14 | src/behaviour/behaviour.controller.ts:55 | POST /records | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 15 | src/behaviour/behaviour.controller.ts:67 | PUT /records/:id | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 16 | src/behaviour/behaviour.controller.ts:111 | POST /tarbiyah | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 17 | src/behaviour/behaviour.controller.ts:135 | PUT /tarbiyah/:id | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 18 | src/modules/modules.controller.ts:27 | POST /:moduleId/activate | MODULES_ADMIN_ROLES | E2: module activation |
| 19 | src/modules/modules.controller.ts:34 | POST /:moduleId/deactivate | MODULES_ADMIN_ROLES | E2: module activation |
| 20 | src/modules/modules.controller.ts:41 | POST /bulk-activate | MODULES_ADMIN_ROLES | E2: module activation |
| 21 | src/modules/modules.controller.ts:48 | POST /activate-all | MODULES_ADMIN_ROLES | E2: module activation |
| 22 | src/modules/teaching/timetable-variant.controller.ts:18 | POST /generate | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 23 | src/modules/teaching/timetable-variant.controller.ts:24 | POST /:id/publish | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 24 | src/modules/teaching/timetable-variant.controller.ts:30 | DELETE /:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 25 | src/modules/teaching/substitution.controller.ts:36 | PATCH /:id/complete | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 26 | src/modules/teaching/ptm.controller.ts:41 | POST / | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 27 | src/modules/teaching/ptm.controller.ts:47 | PATCH /:id/confirm | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 28 | src/modules/teaching/ptm.controller.ts:53 | PATCH /:id/reschedule | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 29 | src/modules/teaching/ptm.controller.ts:59 | PATCH /:id/outcome | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 30 | src/modules/teaching/ptm.controller.ts:65 | PATCH /:id/action-items/:actionItemId | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 31 | src/modules/teaching/ptm.controller.ts:74 | PATCH /:id/cancel | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 32 | src/modules/teaching/teaching.controller.ts:23 | POST /teachers/sync | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 33 | src/modules/teaching/teaching.controller.ts:33 | POST /teachers | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 34 | src/modules/teaching/teaching.controller.ts:37 | PATCH /teachers/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 35 | src/modules/teaching/teaching.controller.ts:45 | DELETE /teachers/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 36 | src/modules/teaching/teaching.controller.ts:51 | PATCH /lesson-plans/:id/approve | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 37 | src/modules/teaching/teaching.controller.ts:55 | PATCH /lesson-plans/:id/reject | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 38 | src/modules/teaching/teaching.controller.ts:62 | POST /lesson-plans | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 39 | src/modules/teaching/teaching.controller.ts:72 | POST /lesson-plans/parse-upload | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 40 | src/modules/teaching/teaching.controller.ts:80 | PATCH /lesson-plans/:id | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 41 | src/modules/teaching/teaching.controller.ts:92 | POST /timetable | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 42 | src/modules/teaching/teaching.controller.ts:96 | PATCH /timetable/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 43 | src/modules/teaching/teaching.controller.ts:105 | DELETE /timetable/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 44 | src/modules/teaching/teaching.controller.ts:122 | POST /electives | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 45 | src/modules/teaching/teaching.controller.ts:126 | PATCH /electives/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 46 | src/modules/teaching/teaching.controller.ts:130 | DELETE /electives/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 47 | src/modules/teaching/teaching.controller.ts:139 | POST /duty-roster | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 48 | src/modules/teaching/teaching.controller.ts:143 | PATCH /duty-roster/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 49 | src/modules/teaching/teaching.controller.ts:147 | DELETE /duty-roster/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 50 | src/modules/teaching/teaching.controller.ts:156 | POST /rooms | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 51 | src/modules/teaching/teaching.controller.ts:160 | PATCH /rooms/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 52 | src/modules/teaching/teaching.controller.ts:164 | DELETE /rooms/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 53 | src/modules/teaching/teaching.controller.ts:173 | POST /period-templates | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 54 | src/modules/teaching/teaching.controller.ts:177 | POST /period-templates/seed-default | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 55 | src/modules/teaching/teaching.controller.ts:181 | PATCH /period-templates/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 56 | src/modules/teaching/teaching.controller.ts:185 | DELETE /period-templates/:id | TEACHING_ADMIN_ROLES | E3-E10/E11: teaching admin write; teacher must not mutate |
| 57 | src/modules/teaching/teaching.controller.ts:197 | POST /assignments | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 58 | src/modules/teaching/teaching.controller.ts:201 | PATCH /assignments/:id | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 59 | src/modules/teaching/teaching.controller.ts:205 | DELETE /assignments/:id | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 60 | src/modules/teaching/teaching.controller.ts:212 | PATCH /assignments/:id/submissions/:submissionId | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 61 | src/modules/teaching/teaching.controller.ts:223 | POST /behaviour | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 62 | src/modules/teaching/teaching.controller.ts:227 | PATCH /behaviour/:id | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 63 | src/modules/hr/hr.controller.ts:106 | POST /leave/applications | HR_LEAVE_ADMIN_ROLES | E1b legacy leave-create bypass (extra, not in brief; web hr.service.submitLeave uses it) |
| 64 | src/modules/hr/hr.controller.ts:269 | POST /leave/balances/allocate | HR_LEAVE_ADMIN_ROLES | E1/E1b: leave administration; blocks self-approval escalation |
| 65 | src/modules/hr/hr.controller.ts:275 | POST /leave/policies/seed-defaults | HR_LEAVE_ADMIN_ROLES | E1/E1b: leave administration; blocks self-approval escalation |
| 66 | src/modules/hr/hr.controller.ts:282 | POST /leave/policies | HR_LEAVE_ADMIN_ROLES | E1/E1b: leave administration; blocks self-approval escalation |
| 67 | src/modules/hr/hr.controller.ts:286 | PATCH /leave/policies/:id | HR_LEAVE_ADMIN_ROLES | E1/E1b: leave administration; blocks self-approval escalation |
| 68 | src/modules/hr/hr.controller.ts:290 | POST /leave/policies/:id/assign | HR_LEAVE_ADMIN_ROLES | E1/E1b: leave administration; blocks self-approval escalation |
| 69 | src/modules/hr/hr.controller.ts:294 | POST /leave/policies/:id/bulk-assign | HR_LEAVE_ADMIN_ROLES | E1/E1b: leave administration; blocks self-approval escalation |
| 70 | src/modules/hr/hr.controller.ts:301 | POST /leave | HR_LEAVE_ADMIN_ROLES | E1/E1b: leave administration; blocks self-approval escalation |
| 71 | src/modules/hr/hr.controller.ts:305 | PATCH /leave/:id/status | HR_LEAVE_ADMIN_ROLES | E1/E1b: leave administration; blocks self-approval escalation |
| 72 | src/ece/ece.controller.ts:120 | POST /observations | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 73 | src/ece/ece.controller.ts:127 | POST /observations/quick | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 74 | src/ece/ece.controller.ts:165 | POST /portfolio | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 75 | src/ece/ece.controller.ts:171 | PATCH /portfolio/:id/share | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |
| 76 | src/ece/ece.controller.ts:215 | PUT /weekly-plan | STAFF_WRITE_ROLES | Tier 2: teacher-app write, blocks parent/student/non-teaching tokens |

Total guards: 76

## Considered but skipped / backlog

- GET routes everywhere (reads intentionally open; parent/student tokens use them).
- `leave/self*` routes (keep `@RequirePermission('leave:self')`, no `@Roles`). Verified by test.
- HR leave reads: `GET leave`, `leave/stats`, `leave/balance(s)*`, `leave/policies`, `leave/applications`, `staff/:id/leave` left open (writes only per brief).
- Assessments: `PATCH marks/verify`, `POST report-cards/generate`, `POST report-cards/publish`, assessment create/update/delete/status (`POST /`, `PUT :id`, `DELETE :id`, `PATCH :id/status`), `omr/*` writes: backlog.
- `POST/PATCH/DELETE ... teaching/exams` (exam.controller.ts), syllabus `slo-templates` writes, `generate-pacing-guide`, `PATCH :id/behind-schedule`, `POST/PUT /syllabus`: E11 flag only, not guarded.
- `teaching/fixtures` `generate-for-absence`, `:id/assign`, `:id/cancel`: E11 candidates, not guarded (only `:id/complete` guarded).
- `ece`: `PATCH portfolio/:id/respond` (family response, parents may call it), `PATCH students/:id/profile/tags`, experiences, environment areas, care-records, support-cases, montessori, framework/domain/skill/indicator/age-band/seed/mapping writes, ai/*: not in brief; framework/seed writes are admin-config candidates.
- `students/behaviour` POST/PUT (students.controller.ts ~557/567), `students/results` POST, students CRUD/fees: not in brief; flag.
- `behaviour`: `PATCH records/:id/resolve`, counselling, interventions, contracts, character-settings: not in brief.
- `students.controller.ts` attendance `GET`s untouched.
- Out of scope but flagged in inventory E12: `/roles` writes, most `/hr/*` writes (staff, payroll, etc.) remain unguarded.
- `modules.controller.ts` still trusts `x-school-slug` header over JWT (cross-tenant); `@Roles` does not fix that.
- Custom-role trap (inventory 4.2): role-only guards check primaryRole from JWT; run pre-flight query before deploy or use Option B.
- No routes were skipped for class-level restructuring: none of the touched controllers had class-level `@Roles`/`@RequirePermission`.
