-- audit-2026-05-23 C2: drop the broken per-user RLS policies on twin_goals
-- and goal_progress_log.
--
-- Why these policies are broken
-- -----------------------------
-- The policies use `auth.uid() = user_id`, but in this codebase `user_id`
-- references `public.users.id` — NOT `auth.users.id`. The two tables hold
-- different UUIDs (CLAUDE.md "Critical Gotchas"). There is no mapping
-- column on `public.users` (no auth_user_id), so auth.uid() never matches.
-- The policies grant zero access via the anon/authenticated PostgREST path.
--
-- Why this is safe to drop
-- ------------------------
-- All goal reads/writes go through the Express API layer with the service
-- role key, which bypasses RLS. The `Service role full access` policy
-- already covers that path. The API enforces `user_id` matching via
-- authenticateUser middleware and explicit `.eq('user_id', userId)` filters
-- on every query.
--
-- Net effect after this migration
-- --------------------------------
-- RLS remains ENABLED on both tables (deny-by-default for anon). The only
-- granted policy is service-role-full-access. Anonymous PostgREST clients
-- still see zero rows — same as today, just without misleading dead policies.
--
-- If real per-user PostgREST-side RLS is ever wanted, add an
-- `auth_user_id UUID` column to `public.users`, backfill it, and rewrite
-- these policies as
--   `(SELECT id FROM public.users WHERE auth_user_id = auth.uid()) = user_id`.

DROP POLICY IF EXISTS "Users view own goals" ON public.twin_goals;
DROP POLICY IF EXISTS "Users insert own goals" ON public.twin_goals;
DROP POLICY IF EXISTS "Users update own goals" ON public.twin_goals;
DROP POLICY IF EXISTS "Users delete own goals" ON public.twin_goals;

DROP POLICY IF EXISTS "Users view own goal progress" ON public.goal_progress_log;
DROP POLICY IF EXISTS "Users insert own goal progress" ON public.goal_progress_log;
DROP POLICY IF EXISTS "Users update own goal progress" ON public.goal_progress_log;

COMMENT ON TABLE public.twin_goals IS
  'Twin-driven goal tracking. Access is service-role only via the Express API '
  'layer (see api/routes/goals.js + middleware/auth.js). Per-user RLS via '
  'auth.uid() is not viable because user_id references public.users.id, not '
  'auth.users.id, and there is no mapping column. See migration '
  '20260524_goals_rls_drop_broken_policies.sql for the full rationale.';
