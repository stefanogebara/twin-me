-- =============================================================================
-- RLS HARDENING PHASE 2 — flagged by Supabase advisor 2026-04-21
--
-- Two new tables shipped without RLS:
--   - user_temporal_comparisons (then_text/now_text narrative)
--   - user_weekly_synthesis (weekly digest narrative)
-- Both exposed via PostgREST. Any authenticated user could read every user's
-- rows. Same severity pattern as the earlier SECURITY DEFINER RPC finding.
--
-- Also fixes advisor warning: function_search_path_mutable on
-- get_daily_memory_counts(uuid) — pins search_path to public.
--
-- Applied live via Supabase MCP on 2026-04-21; this file checked in for
-- reproducibility on fresh environments.
-- =============================================================================

ALTER TABLE public.user_temporal_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_weekly_synthesis ENABLE ROW LEVEL SECURITY;

-- User SELECT policies — (SELECT auth.uid()) subquery form = per-query eval.
DROP POLICY IF EXISTS user_temporal_comparisons_select_own ON public.user_temporal_comparisons;
CREATE POLICY user_temporal_comparisons_select_own
  ON public.user_temporal_comparisons
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_weekly_synthesis_select_own ON public.user_weekly_synthesis;
CREATE POLICY user_weekly_synthesis_select_own
  ON public.user_weekly_synthesis
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Service role writes (backend supabaseAdmin generates these narratives).
DROP POLICY IF EXISTS user_temporal_comparisons_service_all ON public.user_temporal_comparisons;
CREATE POLICY user_temporal_comparisons_service_all
  ON public.user_temporal_comparisons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS user_weekly_synthesis_service_all ON public.user_weekly_synthesis;
CREATE POLICY user_weekly_synthesis_service_all
  ON public.user_weekly_synthesis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- search_path hardening on memory-counts RPC.
ALTER FUNCTION public.get_daily_memory_counts(UUID) SET search_path = public;
