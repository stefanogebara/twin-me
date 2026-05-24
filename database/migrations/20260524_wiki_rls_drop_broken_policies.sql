-- audit-2026-05-24 C1 + M2: drop broken auth.uid() RLS policies on the wiki
-- tables and feature_flags; revoke EXECUTE on match_wiki_pages from anon
-- and authenticated.
--
-- Why the policies are broken
-- ---------------------------
-- All three tables FK on `public.users.id`. The policies guard with
-- `auth.uid() = user_id`, but `auth.uid()` is `auth.users.id` — a DIFFERENT
-- UUID. There's no mapping column on `public.users`, so the policy never
-- matches → zero rows returned via the anon/authenticated PostgREST path.
-- The actual access path is always the Express API with the service-role
-- key (which bypasses RLS) — same model already documented for /goals in
-- migration 20260524_goals_rls_drop_broken_policies.sql.
--
-- What this migration does
-- ------------------------
-- 1. Drops the broken "Users …" policies on the 3 tables.
-- 2. Adds an explicit "service_role full access" policy on feature_flags
--    (the wiki tables already have theirs).
-- 3. Revokes EXECUTE on match_wiki_pages from anon, authenticated, and PUBLIC.
--    The RPC is SECURITY DEFINER and trusts its p_user_id arg — if it's ever
--    callable from PostgREST, any user could pass any user_id and read
--    someone else's wiki. Belt + suspenders.
-- 4. Adds table comments documenting the access model.

-- 1. Drop broken policies
DROP POLICY IF EXISTS "Users view own wiki pages" ON public.user_wiki_pages;
DROP POLICY IF EXISTS "Users view own wiki logs"  ON public.user_wiki_logs;
DROP POLICY IF EXISTS "Users manage own flags"     ON public.feature_flags;

-- 2. Ensure feature_flags has a service-role policy (the wiki tables already do)
DROP POLICY IF EXISTS "Service role full access feature flags" ON public.feature_flags;
CREATE POLICY "Service role full access feature flags"
  ON public.feature_flags
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Make sure RLS stays enabled on feature_flags (was true already; idempotent).
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- 3. Lock down the SECURITY DEFINER RPC
REVOKE EXECUTE ON FUNCTION public.match_wiki_pages(uuid, vector, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_wiki_pages(uuid, vector, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.match_wiki_pages(uuid, vector, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.match_wiki_pages(uuid, vector, integer) TO service_role;

-- 4. Document the access model
COMMENT ON TABLE public.user_wiki_pages IS
  'LLM Wiki compiled domain pages. Access is service-role only via the Express '
  'API layer (api/routes/wiki.js + middleware/auth.js). Per-user RLS via '
  'auth.uid() is not viable because user_id references public.users.id, not '
  'auth.users.id, and there is no mapping column. Same rationale as '
  '20260524_goals_rls_drop_broken_policies.sql.';

COMMENT ON TABLE public.user_wiki_logs IS
  'LLM Wiki compilation change log. Service-role only access; see '
  '20260524_wiki_rls_drop_broken_policies.sql.';

COMMENT ON TABLE public.feature_flags IS
  'Per-user feature flags. Service-role only access via the Express API. '
  'See 20260524_wiki_rls_drop_broken_policies.sql for the access model.';
