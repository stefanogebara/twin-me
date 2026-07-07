# database/migrations/ — CANONICAL (all new migrations go here)

Status as of the 2026-07-04 DB audit. This repo has FOUR migration locations;
this file exists so nobody applies (or writes) a migration in the wrong one.

| Dir | Status |
|-----|--------|
| **`database/migrations/`** (this dir) | **Canonical — write all NEW migrations here.** Newest feature migrations live here (latest ~20260619). |
| `database/supabase/migrations/` | Read-only ARCHIVE of migrations that were applied to prod (base schema + audit-track mirrors). Do not add files. |
| `supabase/migrations/` | DEAD (ancient design-system/professor-twin era). Never apply. |
| `api/migrations/` | DEAD (targets an abandoned schema). Never apply. |

## How migrations are actually applied

There is NO automatic apply step — not in CI, not in the Vercel build.
Migrations are applied manually via the Supabase MCP `apply_migration` tool or
the Supabase SQL editor, then the file is committed here as the record. That
means committing a file does NOT apply it, and nothing verifies the live DB
matches this tree — double-check against the live schema when it matters.

## Rules (from the twinme-dev skill)

- Filename: `YYYYMMDD_description.sql`.
- FK constraints reference `public.users(id)`, never `auth.users(id)` (custom
  JWT auth; `auth.uid()` is NULL in this app).
- `CREATE INDEX CONCURRENTLY` for indexes on existing (non-empty) tables —
  and remember CONCURRENTLY cannot run inside a transaction block.
- Idempotency guards (`IF NOT EXISTS` / `IF EXISTS`) on everything.

## Known drift (audit 2026-07-04)

`user_transactions` + `transaction_emotional_context` are defined in BOTH this
dir (`20260420_user_transactions_financial_emotional.sql`) and the archive
(`20260420_financial_emotional_twin.sql`) with differing column definitions
(`NUMERIC(14,2)` vs bare `NUMERIC`; table-level UNIQUE vs separate unique
index). Both used `IF NOT EXISTS`, so whichever ran first won. Neither file
alone is authoritative for that table — verify against the live DB.
