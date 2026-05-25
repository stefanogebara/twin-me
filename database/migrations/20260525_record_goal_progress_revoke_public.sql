-- Lock down record_goal_progress RPC
--
-- Supabase advisors 0028/0029 flag that this SECURITY DEFINER RPC is callable
-- by anon and authenticated roles via /rest/v1/rpc/record_goal_progress. The
-- backend calls it via service_role only, so revoke EXECUTE from public, anon,
-- and authenticated. service_role retains EXECUTE through table grants.

REVOKE EXECUTE ON FUNCTION public.record_goal_progress(
  p_goal_id uuid,
  p_user_id uuid,
  p_tracked_date date,
  p_measured_value numeric,
  p_target_met boolean,
  p_source_data jsonb,
  p_new_streak integer,
  p_new_best_streak integer,
  p_new_total_tracked integer,
  p_new_total_met integer,
  p_new_status text,
  p_new_consecutive_misses integer,
  p_last_measured_at timestamptz
) FROM PUBLIC, anon, authenticated;
