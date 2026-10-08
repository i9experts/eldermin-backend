# B0 - id typing: string vs ObjectId ids (root cause, fix, what remains)

Status: fixed in code by a global Mongoose query plugin (`feat/staff-portal`). Verified locally (isolated DB `eldermin_teacher_verify`, **no shim**). **Not yet verified on staging** - see "First thing to check on staging".

## 1. Root cause (exact)

* The 541 declarations `@Prop({ type: Types.ObjectId, ... })` (`import { Types } from 'mongoose'`) do **not** compile to an `ObjectId` schema path. With the pinned versions
  (`package-lock.json`: `mongoose 9.6.3`, `@nestjs/mongoose 11.0.4`, `bson 7.2.0`; `npm ci` in the Dockerfile, so production gets the same) `DefinitionsFactory.isMongooseSchemaType`
  (`node_modules/@nestjs/mongoose/dist/factories/definitions.factory.js:103-108`) rejects `Types.ObjectId` (it is the bson class, not a `SchemaType`), the option comes out as `type: {}`
  and the path is **Mixed** (`UserSchema.path('tenantId').instance === 'Mixed'`; 423 id-like Mixed paths over 240 models are counted by the startup self-test; 541 declarations in source).
* A Mixed path is never cast. A filter value is sent to MongoDB exactly as the code supplies it, and MongoDB equality is type-exact (`"64b..."` never equals `ObjectId("64b...")`).
* Ids that come from the JWT (`req.user.tenantId`, `campusId`, `userId`, `institutionId`) are **strings**. Data written by seed scripts / raw inserts / code that wraps in `new Types.ObjectId(..)` is **ObjectId**.
  Data written through the API is **mixed**: the service stores whatever it was given (`tid()` returns the raw JWT string), so `tenantId` is a string while `campusId`/`teacherId`/`institutionId` (explicit `new Types.ObjectId`) are ObjectIds.
  So a campus-scoped caller (string `campusId` vs ObjectId stored) and any caller whose rows were written with ObjectId tenants gets empty lists, and `getMe` (`_id` cast, `tenantId` string vs ObjectId stored) returns 401.

### Evidence (local, plugin OFF via `ID_MATCH_PLUGIN=off`, same build; DB written by the seeds, no shim)

| Endpoint | Code that builds the filter (file:line) | Queried (type) | Stored in DB (`$type`) | Schema path | Result OFF -> ON |
|---|---|---|---|---|---|
| `GET /auth/me` | `modules/auth/auth.service.ts:316-319` `findOne({_id: userId, tenantId, isActive:true})` | `tenantId` string (JWT) | `users.tenantId` objectId | Mixed | 401 -> 200 |
| `GET /teaching/assignments` | `modules/teaching/teaching.service.ts:900-909` `{tenantId, campusId}` (`tid()` at :55 is identity) | `tenantId`, `campusId` strings | assignments (seed) tenantId/campusId/teacherId objectId; (API-written) tenantId **string**, campusId objectId | Mixed | 0 -> 6 (9 with the mixed fixtures) |
| `GET /assessments` | `assessments/assessment.service.ts:1027-1035` `{schoolSlug, campusId}` | `campusId` string | `campusId` objectId (`schoolSlug` string) | campusId Mixed | 0 -> 5 |
| `GET /teaching/lesson-plans` | `teaching.service.ts:153-163` | `tenantId`, `campusId` strings | objectId / objectId | Mixed | 0 -> 7 |
| `GET /teaching/ptm` | `modules/teaching/ptm.service.ts:123-135` | `tenantId`, `campusId` strings | objectId / objectId | Mixed | 0 -> 8 |
| `GET /teaching/fixtures` | `modules/teaching/substitution.service.ts:232-245` (also `$or` on `originalTeacherId`/`substituteTeacherId`) | strings | objectId | Mixed | 0 -> 2 |
| `GET /syllabus` | `syllabus/syllabus.service.ts:95-109` | `tenantId`, `campusId` strings | objectId / objectId | Mixed | 0 -> 3 |
| `GET /academics/curriculum` | `modules/academics/academics.service.ts:387-395` `{tenantId}` only | `tenantId` string | objectId | Mixed | 0 -> 3 |
| `GET /behaviour/records` | `behaviour/behaviour.service.ts:179-192` `{schoolSlug, campusId}` | `campusId` string | `campusId` objectId (8 rows; 40 rows have none) | Mixed | 0 -> 8 |

Stored-type census of the local DB (`mongosh`, `$type`, files `local-verification/out/b0_db_types_before.txt`, `b0_apiwrite_types_before.txt`): `users.tenantId` objectId x4; `assignments`, `lessonPlans`, `ptm_meetings`,
`syllabi`, `curricula`, `timetables` tenantId/campusId objectId; and the two documents created **through the API** as teacher A (an assignment and a lesson plan): `tenantId` **string**, `campusId`/`teacherId`/`institutionId` **ObjectId**.
Consequence for production: if staging/production rows were written by the API they carry string `tenantId` + ObjectId `campusId`; a campus-scoped teacher's string `campusId` then never matches, i.e. production is affected exactly like the local run (whatever the real mix is, a string-only filter can only match one of the two forms).

## 2. Fix

`src/common/utils/id-match.plugin.ts` (+ `id-match.util.ts`, `id-match.selftest.ts`), registered once for every model through `MongooseModule.forRoot(..., { connectionFactory })` in `src/app.module.ts`
(`connection.plugin(idMatchPlugin)` runs before any model is compiled; verified by a real run: all models get the hooks, and the existing options typing needs no `as any`).

For every schema path that is Mixed (or an array of Mixed) the plugin rewrites id-like (24-hex string or ObjectId) **equality, `$eq` and `$in` values in the query filter** (top level and inside `$and`/`$or`/`$nor`) to
`{ $in: [<string form>, <ObjectId form>] }`. Hooks: `find`, `findOne`, `countDocuments`, `distinct`, `updateOne/Many`, `replaceOne`, `deleteOne/Many`, `findOneAndUpdate/Delete/Replace` (so `findById*` too) and the **leading** `$match` stages of `aggregate`.
Upserts are skipped on purpose (Mongo would seed the inserted document from the filter's equality conditions; a `$in` would drop them). No update document and no stored data is ever changed.

* Startup self-test (once, no secrets): `[IdMatch] B0 id-match plugin ENABLED; 423 Mixed-typed id paths across 240 models (...)`. `ID_MATCH_PLUGIN=off` disables the plugin (diagnostics / before-after only; default ON).
* Explicit widening where the plugin cannot reach: `common/utils/notify-guardians.util.ts` (raw `db.collection('users')` read of `guardianOfStudentIds`) now uses `idMatchIn`.
* Spec `src/common/utils/id-match.plugin.spec.ts` is fully in-memory (no Model, no connection): it runs the plugin's registered pre-hooks directly against a clone of the real compiled schemas, and feeds the real filters built by
  `TeachingService.getAssignments/getLessonPlans`, `PTMService.getMeetings`, `AssessmentService.findAll` and `AuthService.getMe` through it. (The first version created Models on a never-connected connection, which buffers: 17 tests timed out at 5 s; now 28 specs in ~1.2 s.)

### Why it is a strict superset and cannot cross tenants
`{ f: v }` -> `{ f: { $in: [String(v), ObjectId(v)] } }` keeps every document that matched before (the original representation is one of the two) and adds only documents whose stored value is the **same 24-hex id** in the other representation.
The same logical id is never a different tenant/campus: ids of another tenant/campus differ in their hex value and stay excluded (verified locally: 7 fixture docs, 3 mixed-type docs of the right tenant/campus returned, the 4 docs of another tenant/campus in both forms not returned).
`$ne`, `$nin`, `$not`, ranges, regexes and non-id values are left untouched (widening them would not be a superset). Writes: an `updateMany/deleteMany` filter `{tenantId}` now also reaches string-stored rows of that very tenant - the rows the author intended; still tenant-bound, and the filter fields the code adds (`campusId`, `_id`, ...) widen the same way.

### Performance
`$in: [string, ObjectId]` on an indexed field is two index probes (one per BSON type) instead of one; same index, no collection scan, negligible for the filters involved (tenant/campus/teacher). Compound-index prefix equality becomes a two-range probe; acceptable.

## 3. Bypass notes (code paths the plugin does not reach)
Reviewed in teaching, assessments, syllabus, academics, behaviour, staff-portal, auth, hr, common:
* **Raw `db.collection(...)` reads** (no Mongoose middleware): `teaching.service.ts:999` `students` by `schoolSlug`/`currentGrade`/`campusId: String(..)` - `Student.campusId` is a real String path, fine; `notify-guardians.util.ts:25` (fixed with `idMatchIn`); parent-portal raw reads were out of scope (not Teacher-app facing) - review before relying on them.
* **`bulkWrite`** (`teaching.service.ts:1011` submissions upsert, `assessment.service.ts:1357/1782`, `hr.service.ts:996/1203/1383/3090`): no query middleware; the filters are built from values taken from the same document being written (same type as stored) and are mostly upserts, so left as is.
* **Non-leading `$match` / `$lookup`**: no `$lookup`/`$graphLookup` in the reviewed services; the aggregates in assessments/behaviour/hr/academics/substitution start with `$match` (handled). A `$match` after another stage is not widened.
* **`populate`** executes `find` on the target model (hook applies, and `_id` is cast). `.exists` / `.where()`: none in the reviewed code. `findById` casts `_id` (fine). `Model.create`/`save` are untouched (the plugin never rewrites written data).
* **Mongoose `ref` population of string-stored ids** works because the target `_id` is a real ObjectId path (cast).

## 4. What remains (proposed permanent fix)
1. Replace all 541 `@Prop({ type: Types.ObjectId ... })` with `@Prop({ type: MongooseSchema.Types.ObjectId ... })` (`import { Schema as MongooseSchema } from 'mongoose'`), so paths are real ObjectId paths and Mongoose casts query values both ways. Mechanical codemod; compile check via the self-test (`schema.path('tenantId').instance === 'ObjectId'`).
2. **Data migration first** (otherwise casting would make string-stored rows invisible): for each collection, convert string ids on those paths to ObjectId (`$convert` / `updateMany` with pipeline), counts before/after, on staging first, with a backup. Only then switch the types and remove the plugin.
3. Until then the plugin is the safety net; do not delete it before the migration is verified.

## 5. First thing to check on staging
Run `eldermin-teacher-app-docs/STAGING_DATA_TYPE_CHECK.md` (read-only `$type` census of `tenantId`, `campusId`, `teacherId`, `userId` on `users`, `staff`, `assignments`, `lessonPlans`, `ptm_meetings`, `assessments`, `syllabi`, `curricula`, `behaviour_records`) and check the startup log line
`[IdMatch] B0 id-match plugin ENABLED; N Mixed-typed id paths`. Then `GET /auth/me`, `/teaching/assignments`, `/assessments` as a campus-scoped teacher must return data. A result of `0 Mixed-typed id paths` means the typing is not the problem on that deployment.
