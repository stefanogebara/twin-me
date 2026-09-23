# api/migrations/ — DEAD (do not apply)

`001_database_optimization.sql` targets an abandoned schema (`conversations`,
`messages`, `profiles`, `document_chunks`) that predates the current `twin_*`
tables — it is NOT the live schema. It also contains hazards if ever run:
non-idempotent `ALTER TABLE ... ADD CONSTRAINT` (no guard, errors on re-run)
and `VACUUM` statements (which cannot run inside a transaction block).

Do not apply this file and do not add migrations here.

**All NEW migrations belong in `database/migrations/`** (see the README there
for the full four-directory map). Identified as dead in the 2026-07-04 DB audit.
