# Phase 4 additions: Teacher app follow-up endpoints (branch `feat/staff-portal`)

Both endpoints live under `/api/v1/staff-portal`, inherit the controller's class-level `@Roles` (all school-staff roles), are read-only, additive, and own-data only. Identity is always the JWT user -> `Staff` (by `Staff.userId`, from the DB, `isActive != false`); nothing identity-related is read from query/body. Missing `schoolSlug` on the JWT -> 403 `No school context on this account.`; no linked staff -> 403 `No staff profile is linked to this account.`. Tenant scope comes from the Staff record's `tenantId`.

Code: `src/staff-portal/staff-teaching.service.ts` (+ `.spec.ts`, 20 tests), routes in `staff-portal.controller.ts`.

## A. GET /staff-portal/homework/pending-grading?limit=50

`limit`: default 50, max 200 (invalid/<1 -> 50, >200 -> 200).

Scope: `Assignment.tenantId = my tenant`, `Assignment.teacherId = my Staff._id` (assignment.schema.ts:7,9), `status != 'draft'` (enum draft|assigned|submitted|graded|overdue, :23). There is no deleted/archived flag on Assignment, so none is filtered. Ungraded = `AssignmentSubmission.status in ('submitted','late')` (enum pending|submitted|late|graded|missed, assignment-submission.schema.ts:25). One aggregation: `$match` + `$lookup` (pipeline `$group` per assignment) + `$project`; no N+1.

Sort: oldest ungraded submission first (`oldestSubmittedAt` asc, null last), then `dueDate` asc, then title. Assignments with 0 ungraded are omitted. `total` = ungraded submissions summed over ALL my non-draft assignments, independent of `limit`. `oldestSubmittedAt` is the min `submittedAt` among ungraded rows (null if those rows have no `submittedAt`).

```json
{
  "total": 7,
  "items": [
    {
      "assignmentId": "665f00000000000000000a01",
      "title": "Fractions worksheet",
      "subject": "Mathematics",
      "gradeLevel": "Grade 5",
      "sectionName": "A",
      "dueDate": "2026-10-01T00:00:00.000Z",
      "submittedCount": 5,
      "totalSubmissions": 28,
      "oldestSubmittedAt": "2026-09-30T07:12:00.000Z"
    },
    {
      "assignmentId": "665f00000000000000000a02",
      "title": "Quiz 3 corrections",
      "subject": "Mathematics",
      "gradeLevel": "Grade 6",
      "sectionName": null,
      "dueDate": "2026-10-03T00:00:00.000Z",
      "submittedCount": 2,
      "totalSubmissions": 30,
      "oldestSubmittedAt": "2026-10-02T09:40:00.000Z"
    }
  ],
  "generatedAt": "2026-10-05T08:00:00.000Z"
}
```
(sample data)

Note: `submittedCount` is the number of UNGRADED submissions (name kept per the agreed contract). `totalSubmissions` counts all roster rows, including pending/missed/graded. Unlike `GET /teaching/assignments`, no campus filter is applied: the teacher's own `teacherId` is the scope, so own null-campus assignments are not hidden.

## B. GET /staff-portal/timetable?date=YYYY-MM-DD  |  ?from=YYYY-MM-DD&to=YYYY-MM-DD

- `date` = single day. `from`+`to` = inclusive range, max 14 days. `date` cannot be combined with `from`/`to`. No parameters -> 400 (no implicit "today": server timezone is unknown, U3; the client sends the date).
- 400 for: bad format, impossible calendar date (2026-02-30), `to` < `from`, more than 14 days, missing `to`/`from`.
- Dates are calendar dates; `dayOfWeek` is computed in UTC from the string (0 = Sunday, matching `Timetable.periods[].day`, timetable.schema.ts:19).
- Source: all `status:'active'` timetables of my tenant (:72). If my Staff has a `campusId`, filter is `campusId in [mine, null]` (other campuses excluded; campus-less rows kept).
- A period is mine if `periods[].teacherId == my Staff._id` (:24), or, for split periods (whose own teacherId is blank, :52-56), any `periods[].splitGroups[].teacherId == my Staff._id` (:57-66). Then `splitGroup = {name: group.label, subject: period.subject, roomNo: group.roomNo}` and the slot `roomNo` is the group's room. (`splitGroups[]` has no subject of its own, so the period subject is used.) Elective legs (`electiveGroupId`, :50) are ordinary periods with a top-level teacherId in each class's timetable and are matched by the first rule. Blank/absent teacherId rows are ignored.
- Slots per day sorted by `startTime`, then `periodNo`, then `timetableId`. `startTime`/`endTime` trimmed only, otherwise passed through (U7).
- Dedupe (U6): only identical entries are dropped, key = (timetableId, day, periodNo, weekCycle, split group label). Different timetable documents for the same class are NOT merged; every slot carries `timetableId`.

### A/B week decision

NOT computed. `weekCycleEnabled`/`cycleAnchor` (timetable.schema.ts:75-80) are documented only by a schema comment ("cycleAnchor is the first day of a Week A; parity = floor(daysSince(anchor)/7) % 2"). No backend or web code writes or reads `cycleAnchor`, so a real rule is not verifiable (U1). Therefore every day returns `weekCycle: null`, and ALL of my slots for that weekday are returned, each tagged with its own period `weekCycle` (`'both'` | `'A'` | `'B'`; missing -> `'both'`). `'A'` and `'B'` variants of the same period slot appear side by side. The client must treat `'both'` as always applicable, and only show `'A'`/`'B'` slots once a rule is agreed. When product confirms the anchor semantics (parity 0 = A), computing `weekCycle` per day server-side is a small additive change.

```json
{
  "from": "2026-10-05",
  "to": "2026-10-06",
  "days": [
    {
      "date": "2026-10-05",
      "dayOfWeek": 1,
      "weekCycle": null,
      "slots": [
        {
          "timetableId": "665f00000000000000000001",
          "gradeLevel": "Grade 5",
          "sectionName": "A",
          "periodNo": 1,
          "startTime": "08:00",
          "endTime": "08:40",
          "subject": "Mathematics",
          "roomNo": "101",
          "type": "regular",
          "weekCycle": "both",
          "splitGroup": null
        },
        {
          "timetableId": "665f00000000000000000002",
          "gradeLevel": "Grade 7",
          "sectionName": "B",
          "periodNo": 3,
          "startTime": "09:20",
          "endTime": "10:00",
          "subject": "Languages",
          "roomNo": "205",
          "type": "regular",
          "weekCycle": "A",
          "splitGroup": { "name": "French", "subject": "Languages", "roomNo": "205" }
        }
      ]
    },
    { "date": "2026-10-06", "dayOfWeek": 2, "weekCycle": null, "slots": [] }
  ]
}
```
(sample data)

## UNVERIFIED

| # | Item |
|---|---|
| U1 | Which letter (A/B) a date falls in; whether `cycleAnchor` parity 0 = 'A'. Day `weekCycle` is therefore always null. |
| U6 | Whether duplicate active timetables exist for one class in real data. Handled defensively (see dedupe above). |
| U7 | Time strings are "HH:mm" by convention only (no schema regex); passed through trimmed. Malformed legacy values would sort lexicographically. |
| U2 | Legacy rows holding TeacherProfile ids instead of Staff ids would not match (slots/assignments missing for such teachers). |
| U8 (new) | Whether `Staff.campusId` is populated in real data and consistent with `Timetable.campusId`; campus filter is `[mine, null]`. |
| U9 (new) | Real-data volume of `assignmentSubmissions` per assignment; the `$lookup` relies on the `assignmentId` index (assignment-submission.schema.ts:17), no load test was possible (no DB access). |
| U10 (new) | Other `assignmentSubmissions.status` values written by legacy code outside the schema enum would not count as ungraded. |

---

# Updated PR description (paste into GitHub, replaces the previous text)

## Staff portal: backend for the Eldermin Teacher app

### Summary (Phase 1)
- Adds `staffId` + `teacherProfileId` to the JWT, login response, and `GET /auth/me` (additive).
- New module `src/staff-portal/` under `/api/v1/staff-portal`: `me`, notifications (list, unread-count, read, read-all), message threads (list, create, messages, send, read, close), student guardians, student-leave review (class teachers), device-token register/remove, account deletion request. Class-level `@Roles` for school-staff roles; identity always from the JWT user -> `Staff.userId` in the DB.
- Notification emitters (best-effort): lesson plan approve/reject, substitution assigned, PTM created/rescheduled, staff leave status change. Notification `type` enum extended additively.
- Hardening: 76 additive `@Roles` decorators on admin/staff-write routes, DB-backed custom-role fallback, leave self-approval block. Details in `docs/staff-portal/guards-added.md`; remaining items in `hardening-backlog.md`.
- Tolerant grade/section matching (`class-match.util.ts`), plus a read-only audit script.
- See `docs/staff-portal/PHASE1_REPORT.md` for decisions needing review (custom-role pre-flight query before deploy, messaging scope, string-match data alignment).

### Teacher app follow-ups
Two read-only, own-data endpoints (details, JSON examples and UNVERIFIED items in `docs/staff-portal/PHASE4_ADDITIONS.md`):
- `GET /staff-portal/homework/pending-grading?limit=` : ungraded (`submitted`|`late`) submissions across my non-draft assignments, computed in one aggregation; `total` spans all my assignments, `items` capped (default 50, max 200), oldest first, zero-ungraded omitted.
- `GET /staff-portal/timetable?date=` or `?from=&to=` (max 14 days): my own slots resolved server-side by `Staff._id` across all active timetables, including teachers who appear only in `splitGroups`. A/B week is NOT guessed: the day `weekCycle` is `null` and each slot carries its own `both|A|B` tag (the `cycleAnchor` rule exists only as a schema comment, U1). Identical duplicate slots are deduped; different timetable docs are kept with `timetableId`.

### Testing
`npm run build` and `npx jest` pass (full suite). New fake-model specs: `staff-teaching.service.spec.ts` (20 tests). No production DB was touched.

### Deploy notes
No schema or index changes. `StaffPortalModule` now also registers the `Assignment` and `Timetable` models.
