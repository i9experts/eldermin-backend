# Drop the ParentLead collection (prod, human-run, AFTER deploy)

The ParentLead self-signup code (SmartVan leftover) was removed. Its data lives in
the MongoDB collection `parentLeads` (from `@Schema({ collection: 'parentLeads' })`).
Nothing in the app reads or writes it any more.

**DO NOT RUN BEFORE BACKUP (step 2). Run only after backend and web are deployed.**

Deploy order: ship the app update first; merge and deploy backend and web together;
then a human runs the steps below. Keep the backup until you are sure nothing needs it.

Replace `$MONGODB_URI` with the prod connection string (database name included).

## 1. Count documents

```bash
mongosh "$MONGODB_URI" --quiet --eval 'db.getCollection("parentLeads").countDocuments({})'
```

## 2. Back up (do both; they contain parent emails, phones, password hashes: store securely)

```bash
mongoexport --uri="$MONGODB_URI" --collection=parentLeads --out=parentLeads-$(date +%F).json
mongodump   --uri="$MONGODB_URI" --collection=parentLeads --out=./parentLeads-dump-$(date +%F)
```

Verify the export line count / dump size matches the count from step 1.

## 3. Drop (only after the backup is verified)

```bash
mongosh "$MONGODB_URI" --quiet --eval 'db.getCollection("parentLeads").drop()'
```
