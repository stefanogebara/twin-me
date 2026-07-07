# supabase/migrations/ — DEAD (do not apply)

These 14 files (001–011) are from the ancient design-system / professor-twin
era and do NOT target the current `twin_*` schema. They are kept only for
historical reference. Do not apply them and do not add files here.

`supabase/config.toml` in the repo root is just a one-line project link; it
does NOT cause these files to be applied (there is no `supabase db push` in
CI or the Vercel build — migrations are applied manually).

**All NEW migrations belong in `database/migrations/`** (see the README there
for the full four-directory map). Identified as dead in the 2026-07-04 DB audit.
