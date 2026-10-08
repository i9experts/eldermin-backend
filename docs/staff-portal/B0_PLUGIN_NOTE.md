# B0 id-match Mongoose plugin: note for the backend owner (Atiq)

Branch `feat/staff-portal`, repo `eldermin-backend`. Please read this before merging: the plugin is global, so it changes query behaviour for the whole backend, including the web app, not only the Teacher app.

Commits (separate on purpose, so each can be reviewed or reverted alone):

| SHA | Content |
|---|---|
| `074e72a` | `src/common/utils/id-match.util.ts` + spec: pure helpers (`idMatch`, `idMatchIn`, `widenIdFilter`) |
| `ea26276` | `id-match.plugin.ts` + spec, `id-match.selftest.ts`, `app.module.ts` wiring (4 lines), widening of the raw read in `notify-guardians.util.ts` |
| `35fefde` | docs only: `docs/staff-portal/B0_ID_TYPING.md` |

## 1. Root cause

541 declarations of the form `@Prop({ type: Types.ObjectId, ... })` (`Types` from `mongoose`, e.g. `user.schema.ts:13`, `assignment.schema.ts:9`) do not become ObjectId schema paths with the pinned versions (`mongoose 9.6.3`, `@nestjs/mongoose 11.0.4`, `bson 7.2.0`; the Dockerfile uses `npm ci`, so production has the same). `node_modules/@nestjs/mongoose/dist/factories/definitions.factory.js:103-108` (`isMongooseSchemaType`) rejects `Types.ObjectId` because it is the bson class and not a `SchemaType`. The option becomes `type: {}` and the path is **Mixed** (`UserSchema.path('tenantId').instance === 'Mixed'`).

A Mixed path is never cast. Mongoose sends the filter value exactly as the code supplies it, and MongoDB equality is type-exact: `"64b..."` never equals `ObjectId("64b...")`.

- Ids from the JWT (`tenantId`, `campusId`, `userId`, `institutionId`) are strings.
- Seed scripts, raw inserts and code that wraps in `new Types.ObjectId(...)` store ObjectIds.
- Data written through the API is mixed: `tid()` returns the raw JWT string, so `tenantId` is a string, while `campusId`/`teacherId`/`institutionId` (explicit `new Types.ObjectId`) are ObjectIds.

Observed on the as-built backend (local DB `eldermin_teacher_verify`, plugin off via `ID_MATCH_PLUGIN=off`, same build; details and file:line per endpoint in `B0_ID_TYPING.md` section 1):

- `GET /auth/me` returned 401 (`auth.service.ts:316-319`: `_id` is cast, `tenantId` string vs ObjectId stored).
- Nine list families returned empty: assignments (`teaching.service.ts:900-909`), assessments (`assessment.service.ts:1027-1035`), lesson plans (`:153-163`), PTM (`ptm.service.ts:123-135`), fixtures (`substitution.service.ts:232-245`), syllabus (`syllabus.service.ts:95-109`), curriculum (`academics.service.ts:387-395`), behaviour records (`behaviour.service.ts:179-192`). With the plugin on they return 6, 5, 7, 8, 2, 3, 3 and 8 rows (assignments 9 with the mixed fixtures).

Whether staging/production holds the same mix is **not yet known**. See section 5 and `STAGING_DATA_TYPE_CHECK.md`.

## 2. Exactly what the plugin changes

Registration: `MongooseModule.forRoot(..., { connectionFactory: idMatchConnectionFactory })` in `app.module.ts:73`. It calls `connection.plugin(idMatchPlugin)` before any model is compiled, so every model on the default connection gets the hooks.

**Operations hooked (pre-hooks):** `find`, `findOne`, `countDocuments`, `distinct`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `findOneAndUpdate`, `findOneAndDelete`, `findOneAndReplace` (so `findById*` and `populate` go through it), and the **leading** `$match` stage(s) of `aggregate`. Operations with `{ upsert: true }` are skipped on purpose (Mongo seeds the inserted document from the equality conditions of the filter; `$in` would lose them).

**Paths affected:** only paths whose schema type is Mixed, or an array of Mixed (the `[Types.ObjectId]` case, e.g. `guardianOfStudentIds`). Real ObjectId/String paths are left to Mongoose (`Student.campusId` is a real String path, `schoolSlug` is a String path).

**Rewrite:** for such a path, an id-like value (24-hex string or ObjectId) used as plain equality, `$eq` (when sole operator) or `$in` (each element) becomes

    { field: "64b...1" }  ->  { field: { $in: ["64b...1", ObjectId("64b...1")] } }

at the top level and inside `$and` / `$or` / `$nor`. `$in` lists are expanded to both forms of every id and de-duplicated; non-id entries are kept.

**Not touched:**
- `$ne`, `$nin`, `$not`, ranges (`$gt` ...), regexes, `$exists`, non-id values (numbers, slugs, dates, null), anything under other operators.
- `_id` (a real ObjectId path, Mongoose already casts it).
- Stored data and update documents: the plugin never rewrites what is written; `create`/`save` are not hooked.
- A non-leading `$match`, `$lookup` pipelines (none in the reviewed services).

**Bypasses (code the plugin cannot reach):** raw `db.collection(...)` reads (`teaching.service.ts:999` is fine because `Student.campusId` is a String; `notify-guardians.util.ts` was fixed explicitly with `idMatchIn` in `ea26276`; parent-portal raw reads were not reviewed), and `bulkWrite` (`teaching.service.ts:1011`, `assessment.service.ts:1357/1782`, `hr.service.ts:996/1203/1383/3090`; filters come from the same document being written and are mostly upserts).

**Safety nets:** the hook body is wrapped in `try/catch`, so a widening error leaves the original filter in place (the query is never broken). Kill switch: env `ID_MATCH_PLUGIN=off` (default on). Startup log line, once:

    [IdMatch] B0 id-match plugin ENABLED; 423 Mixed-typed id paths across 240 models (...)

(`DISABLED (ID_MATCH_PLUGIN=off)` when switched off; `0 Mixed-typed id paths` on a deployment means the typing is not the problem there.)

## 3. Why tenant/campus isolation is preserved

**Argument.** `{ f: v }` becomes `{ f: { $in: [String(v), ObjectId(v)] } }`. Both elements are the same 24-hex value. A document matches the new filter iff its stored value is that hex id as a string or as an ObjectId. Everything that matched before still matches (superset), and the only new matches carry the same logical id in the other representation. A different tenant or campus has a different hex value, so it stays excluded in both forms. Ids that are not 24-hex are returned unchanged, and `$ne`/`$nin` are not widened (widening them would break the superset property in the other direction).

**Write operations.** `updateMany`/`deleteMany`/`findOneAnd*` filters are widened the same way. A filter `{ tenantId }` now also reaches rows of that very tenant that were stored as strings (or as ObjectIds), which is what the author intended; a different tenant can never be reached. The extra fields the code adds (`campusId`, `_id`, ...) widen identically, so the combined filter is still the conjunction of the same logical ids. This is the one place where behaviour grows in the dangerous direction (more rows are modified/deleted than before), but only rows that were wrongly unreachable before and belong to the same tenant/campus.

**Existing specs** (`id-match.plugin.spec.ts`, in-memory, runs the registered hooks against clones of the real compiled schemas; 28 specs in about 1.2 s):
- `plugin: both id representations are matched, other ids are not`: each of `assignment` / `lesson plan` / `ptm meeting` `: { tenantId, campusId } as strings (JWT form)` returns exactly the four own-tenant/campus documents (object, string, mixed1, mixed2) and none of `otherTenant`, `otherTenantStr`, `otherCampus`, `otherCampusStr`.
- `ObjectId-typed filter values also match string-stored docs`; `syllabus / curriculum / behaviour tenant+campus filters`; `assessment campus filter (schoolSlug is a String path and is untouched)` (also asserts a different `schoolSlug` or a different campus is rejected).
- `findOne by _id + tenantId (getMe shape): _id still cast, tenantId widened`.
- `$in / $or / array-valued id filters`; `is a superset: everything the plain filter matched still matches`; `typed (non-Mixed) paths are left to Mongoose`; `upserts keep the plain equality filter`; `updates/deletes/counts are widened too; aggregate leading $match is widened`.
- `array-of-id paths (guardianOfStudentIds)`: `element equality / $in matches string and ObjectId elements, not other ids`.
- `real service filters pass through the plugin and match both forms`: `TeachingService.getAssignments (campus-scoped teacher)`, `getLessonPlans`, `PTMService.getMeetings`, `AssessmentService.findAll`, `AuthService.getMe`.
- Util spec (`id-match.util.spec.ts`): `widens mixed id paths only; leaves others, operators and $ne alone`, `does not mutate its input`, `leaves invalid values alone`, `invalid / null / undefined / numbers / objects are returned unchanged`.

**Live demonstration** (isolated local DB `eldermin_teacher_verify`, scratch collection `b0_explain_scratch`, 60,000 documents: 20 tenants x 5 campuses x 50 teachers; `tenantId` stored as string for half of the rows and ObjectId for the other half, `campusId` an ObjectId except about a quarter stored as string; the real `dist/.../id-match.plugin.js` applied to a schema with Mixed paths on a scratch connection; counts only):

| Query (JWT-form strings) | Plugin off | Plugin on | Ground truth (`$toString` compare) |
|---|---|---|---|
| `{ tenantId: T0 }` | 1500 | 3000 | 3000 |
| `{ tenantId: T0, campusId: C0 }` | 86 | 600 | 600 |
| `{ tenantId: T0, campusId: C0 }`, returned rows of another tenant / another campus | - | 0 / 0 | - |
| `{ tenantId: T0 }`, returned rows belonging to tenant T1 | - | 0 | - |
| `{ tenantId: <unknown id> }` | - | 0 | - |
| `{ tenantId: { $ne: T0 } }` (not widened) | 58500 | 58500 | - |

The ground truth is an independent `$expr` query comparing `$toString` of the stored values. The widened result equals it exactly and is larger than the plain result only by same-tenant/same-campus documents stored in the other representation.

## 4. Performance

Method: `explain('executionStats')` through Mongoose on the same scratch collection (60,000 docs, MongoDB 8.3.4), plain model (no plugin) versus widened model (plugin), second run of each (warm). Indexes mirror the real declarations: `assignment.schema.ts:37-38` `{tenantId, teacherId, dueDate:-1}` and `{tenantId, subject, gradeLevel, status}`, plus `_id`. The real schema has **no index containing `campusId`**, so (a) is measured on the real indexes and then again with a hypothetical `{tenantId, campusId, dueDate:-1}` index (rows a3/a4, marked H) to show what a campus index would do. Timings below 5 ms on 60k docs are noise; read the key/doc counts.

| Query | Variant | Plan | keysExamined | docsExamined | returned | ms |
|---|---|---|---|---|---|---|
| (a) `{tenantId, campusId}` | plain | FETCH > IXSCAN `tenantId_1_teacherId_1_dueDate_-1` | 1500 | 1500 | 86 | 2 |
| (a) | widened | same | 3002 | 3000 | 600 | 2 |
| (a2) same + `sort dueDate:-1, limit 20` | plain | SORT > FETCH > IXSCAN (same index) | 1500 | 1500 | 20 | 2 |
| (a2) | widened | same plan | 3002 | 3000 | 20 | 4 |
| (a3, H) `{tenantId, campusId}` | plain | FETCH > IXSCAN `tenantId_1_campusId_1_dueDate_-1` | 86 | 86 | 86 | 0 |
| (a3, H) | widened | same index | 605 | 600 | 600 | 0 |
| (a4, H) + `sort dueDate:-1, limit 20` | plain | LIMIT > FETCH > IXSCAN | 20 | 20 | 20 | 0 |
| (a4, H) | widened | LIMIT > FETCH > **SORT_MERGE** > 4 x IXSCAN | 23 | 20 | 20 | 0 |
| (b) `{tenantId, teacherId}` + `sort dueDate:-1` | plain | FETCH > IXSCAN | 0 | 0 | 0 | 0 |
| (b) | widened | FETCH > **SORT_MERGE** > 4 x IXSCAN (same index) | 60 | 60 | 60 | 0 |
| (b2) same + `limit 20` | widened | LIMIT > FETCH > SORT_MERGE > 4 x IXSCAN | 21 | 20 | 20 | 0 |
| (c) `findOne({_id, tenantId})` (getMe) | plain | LIMIT > FETCH > IXSCAN `_id_` | 1 | 1 | 0 | 0 |
| (c) | widened | same | 1 | 1 | 1 | 0 |

Honest reading:

- No query turned into a COLLSCAN. Every widened query still uses the same index as the plain one; for (c) the `_id_` index decides everything and `tenantId` is only a residual filter, so getMe costs nothing extra.
- **Plain rows are not a fair "cost" baseline where they return fewer rows**: with mixed data the plain query returns 86 / 0 rows because it misses the other representation (that is the bug). The widened query examines more keys mainly because it now returns the documents it was missing (600 vs 86). A like-for-like check: widened keys examined (3002) is about 2 x plain (1500) plus 2, i.e. two probes of the same index range, one per BSON type, exactly the predicted cost.
- (a)/(a2) are scoped by `tenantId` only in the index (no `campusId` in any real index), so both variants scan all of the tenant's rows in the index and filter `campusId` on the fetched document. That is an existing weakness, not caused by the plugin; the plugin doubles the tenant range only when the data really has both representations. With a hypothetical campus index (a3) the widened probe is 605 keys for 600 results.
- **Planner change to know about:** when two or more indexed fields are `$in` (tenant and teacher, or tenant and campus) and the query sorts on the next index field, the planner switches from a single ordered scan to `SORT_MERGE` over 2 x 2 = 4 index scans (b, b2, a4). The sort stays index-supported (no blocking in-memory SORT) and with `limit 20` it stops after 21-23 keys, so this is fine; but a plan with a blocking SORT is not introduced anywhere I measured. Where the sort field is not in the index (a2) the plan has a blocking SORT with or without the plugin, with 2x the input.
- Skip/limit: with `skip(n)` on a SORT_MERGE plan the server still merges n+limit entries; no measured change in order. Result **order** for queries without an explicit sort is by index/natural order and was never guaranteed; with the widened filter two ranges are returned in index order of the first field (string before ObjectId in BSON order), so an unsorted list can come back in a different order than before. Lists that need an order should (and the paginated ones do) specify a sort.
- Only one run per query was timed and the machine is a laptop; do not read the ms column as production latency. What carries over is the plan shape and the key counts.

The scratch collection was dropped at the end and confirmed absent; the database still has 239 collections (unchanged).

## 5. Risks and what to watch in review / rollout

1. **Behaviour change on the web.** Result sets can only grow (superset), and only by documents of the **same** tenant/campus that were invisible before because they were stored in the other representation. That is the bug being fixed, but it will also surface rows on the web that nobody has seen (old/seeded/imported data). Counts, dashboards and "list all" screens may show more rows after deploy. Write operations (`updateMany`/`deleteMany`) may now reach more same-tenant rows (section 3). Lookup by an ObjectId-typed stored value now matches string-typed rows too; there is no case where it matches a different id.
2. **Mixed + `$in` on multikey indexes.** For array paths (`guardianOfStudentIds`, `timetables.periods.teacherId`, `exam-session invigilators.staffId`) an `$in` over a multikey index is still two bounds per index, but multikey index bounds cannot always be tightened across compound fields; watch those queries first if anything is slow (the notify-guardians read).
3. **Plan caching.** Query shape changes (equality becomes `$in`), so cached plans for the old shape are not reused; plans are rebuilt after deploy (a one-off cost per shape, restart clears the cache anyway). Planner can pick a different index than before for a widened filter (we saw one such case in the plain-exact baseline: an alternative index was chosen for an equality filter); it is worth comparing slow-query logs for the first day.
4. **Ordering / memory.** SORT_MERGE keeps a few cursors open (4 for two `$in` fields); memory is negligible. An unsorted list may change its default order (section 4).
5. **Bypass paths still miss data.** Raw `db.collection()` reads and `bulkWrite` filters (listed in section 2) are not widened. Parent-portal raw reads were not reviewed.
6. **Hidden coupling.** The hooks swallow exceptions by design, so if widening ever throws, the old (buggy) filter is used silently. The startup line and the endpoints in the checklist below are the only signal.
7. **First thing to check on staging:** run `STAGING_DATA_TYPE_CHECK.md` (read-only `$type` census, counts only) before or right after deploy. If staging is uniformly string-tenant/string-campus (or uniformly ObjectId) the plugin is a no-op there; only the doubled index probe remains.

## 6. Rollout and rollback

- **Separate commits** for independent review and revert: `074e72a` (util), `ea26276` (plugin + wiring + self-test + notify-guardians), `35fefde` (docs). Reverting `ea26276` removes the behaviour change (and the util becomes unused; it is harmless). Reverting only the 4-line `app.module.ts` wiring also disables it.
- **Instant switch without a redeploy of code:** set `ID_MATCH_PLUGIN=off` and restart; the log shows `DISABLED`. Intended for diagnostics and before/after comparison, but it is also the rollback.
- **Tests:** `id-match.util.spec.ts` (10 `it` blocks) and `id-match.plugin.spec.ts` (28 specs, in-memory, about 1.2 s, no DB). Run `npx jest src/common/utils/id-match` before merge.
- **Staging checklist after deploy (5 lines):**
  1. Log contains `[IdMatch] B0 id-match plugin ENABLED; N Mixed-typed id paths across M models` with N greater than 0.
  2. Run `STAGING_DATA_TYPE_CHECK.md` and send the counts to the Teacher-app owner.
  3. As a campus-scoped teacher: `GET /auth/me` returns 200, `/teaching/assignments`, `/assessments`, `/teaching/lesson-plans` return the expected rows.
  4. As a user of a different tenant/campus: the same endpoints return none of the first user's rows (isolation spot check), and the web admin list counts look plausible.
  5. Watch the slow-query log / Atlas profiler for the endpoints above for a day; if worse than expected set `ID_MATCH_PLUGIN=off` and restart.

## 7. Long-term fix (not done now)

1. **Types:** replace the 541 `@Prop({ type: Types.ObjectId })` with `@Prop({ type: MongooseSchema.Types.ObjectId })` (`import { Schema as MongooseSchema } from 'mongoose'`) by codemod, so paths are real ObjectId paths and Mongoose casts both directions. Compile check: `schema.path('tenantId').instance === 'ObjectId'` (the self-test can assert it).
2. **Decision to make first: which single representation.** Recommendation: ObjectId everywhere for ids that reference documents (matches the declared types and the `ref`s, enables `populate` and `$lookup` without `$toObjectId`), string only for external ids. The cost is converting all string `tenantId` values written by the API and changing the code that compares or stores `req.user.tenantId` strings (casting by Mongoose would then do it automatically on paths that are typed).
3. **Data migration comes before the type switch** (otherwise Mongoose casting would make string-stored rows invisible):
   - Inventory: per collection and field, `$type` census (the staging script already does this for ten collections; extend to all 240 models using the list of Mixed paths the self-test already computes).
   - Script outline per collection: `updateMany({ f: { $type: 'string' } }, [ { $set: { f: { $convert: { input: '$f', to: 'objectId', onError: '$f', onNull: null } } } } ])`, for each id-like field, in batches by `_id` range; rows whose value is not a valid 24-hex are logged and skipped; before/after `$type` counts must show zero strings; idempotent so it can be re-run.
   - Order: backup (mongodump / Atlas snapshot) -> migration on a staging copy -> run the full API regression + this plugin still on -> staging -> production in a maintenance window, collections in dependency order (`users`, `staff`, then everything referencing them), then deploy the typed build, then remove the plugin last.
   - Downtime: the script is online-safe per collection while the plugin is on (reads match both forms during the migration; writers still produce the same mix as before until the typed build ships), so a short write freeze is only needed for the final switch deploy.
   - Test plan: unit (self-test asserts no Mixed id paths), data (zero string-typed ids on typed paths), API (this repo's `verify_local.py` run against a restored copy), rollback by restoring the backup or redeploying the previous build with the plugin on.
4. **Why not now:** 541 declarations across 240 models plus an unknown production data mix (staging check not run yet) is a large, risky change that touches every module; casting without migrating would hide data. The plugin is the small, reversible safety net that unblocks the Teacher app now. Do not delete it before the migration is verified on staging and production.
