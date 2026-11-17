# student_attendance index migration (subject-wise attendance)

Script: `src/scripts/migrate-student-attendance-index.ts` (compiled to `dist/scripts/migrate-student-attendance-index.js`, also `npm run migrate:student-attendance-index`).

## What it does
The collection `student_attendance` still carries the old UNIQUE index `{ studentId: 1, date: 1 }`. Subject-wise attendance needs one record per student, day AND subject, so a second subject on the same day is a duplicate-key error (the API answers 409 until this runs). The script:

1. creates the new unique index `{ studentId: 1, date: 1, subject: 1 }` (`studentId_1_date_1_subject_1`) **first**;
2. drops the old `{ studentId: 1, date: 1 }` index only afterwards (a crash in between leaves both indexes: still safe);
3. never deletes or edits a document. It prints counts and ids only (no names).

## Safety properties
* **Dry run is the default.** Without `--apply` it only reads and prints the plan (index state, doc count, studentId types, blocking/logical duplicates).
* `--apply` is refused (exit 3) unless `--confirm-db=<name>` equals the database name it actually connected to; it prints host + database before doing anything.
* **Idempotent**: a second run says "Nothing to do" and exits 0.
* Exit codes: `0` ok, `2` no database given, `3` refused (confirm-db mismatch), `4` blocking duplicates (see below), `1` unexpected error.
* The app works before and after: daily-mode schools are unaffected either way; before the migration a subject-wise second subject answers a clear 409.
* Main also ships `scripts/drop-stale-attendance-index.ts` for the same stale index; either script may be used, this one also creates the new index first and reports duplicates.

## Exact production commands (owner runs them; nothing in CI or deploy runs them)
```bash
# 0. take a database snapshot / backup first (Atlas: on-demand snapshot)

# 1. on a host with the built release (npm run build already done) and the PRODUCTION connection string in $MONGODB_URI
cd <backend release dir>
node dist/scripts/migrate-student-attendance-index.js --uri="$MONGODB_URI"
#    read the output: expected state "old-only" (or "both"), blockingTotal 0.

# 2. apply, typing the REAL database name (shown in the dry-run output) to confirm
node dist/scripts/migrate-student-attendance-index.js --uri="$MONGODB_URI" --apply --confirm-db=<database name>

# 3. verify: run the dry run again, it must report "Nothing to do"
node dist/scripts/migrate-student-attendance-index.js --uri="$MONGODB_URI"
```
Then in the web (or the teacher app) switch a test school to subject-wise mode and save two different subjects for one student on one day: both must save.

## If it reports blocking duplicates (exit 4)
That only happens on a database where the old unique index is already missing. The listed ids are exact duplicates on `{studentId, date, subject}`; a human decides which record to keep (the script never deletes). "Logical" duplicates (the same student stored once as a string id and once as an ObjectId) are listed for information and do not block either index.

## Local use
`MONGODB_URI=mongodb://127.0.0.1:27017/<local db> node dist/scripts/migrate-student-attendance-index.js` is safe (dry run). Never pass a non-local URI together with `--apply` outside the production procedure above.
