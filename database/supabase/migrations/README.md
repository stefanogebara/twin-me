# database/supabase/migrations/ — READ-ONLY ARCHIVE (do not add files)

This dir is an archive of migrations that WERE applied to the live Supabase
project: the original base schema (user_memories, user_platform_data, the
twin_* chat tables) plus audit-track mirrors of changes applied directly via
the SQL editor / MCP `apply_migration` (e.g. `20260514_audit_l2_drop_unused_
indexes_pass1.sql` is annotated "Applied to prod 2026-05-13 ... Mirrored here
so the migration is tracked in the repo").

It is NOT "frozen/diverged from prod" (an older skill doc claimed that — it
was wrong and was corrected in the 2026-07-04 audit). It is simply no longer
where new work goes.

**All NEW migrations belong in `database/migrations/`** — see the README
there for the full four-directory map, the manual-apply workflow, and the
known `user_transactions` duplicate-definition drift between the two trees.
