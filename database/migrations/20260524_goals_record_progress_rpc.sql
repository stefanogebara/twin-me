-- audit-2026-05-23 M16: atomic progress write.
--
-- Before: trackGoalProgress did two non-atomic writes — INSERT into
-- goal_progress_log, then UPDATE twin_goals. If the second write failed
-- (network blip, transient 503), the log row existed but the counter
-- didn't move. Next ingestion's `alreadyTracked` check (driven by the log)
-- short-circuited → counter stuck stale until the next tracked_date.
--
-- After: this RPC wraps both writes in a single Postgres function so they
-- succeed or fail together. Caller passes pre-computed streak/total values
-- (streak math involves grace-day logic + status decisions that don't
-- translate cleanly to SQL); the RPC just persists them atomically.
--
-- Idempotency is preserved by ON CONFLICT (goal_id, tracked_date) DO NOTHING
-- on the log row. If a concurrent caller already inserted today's row the
-- log INSERT is a no-op but the UPDATE still runs — that's OK because both
-- callers compute the same target counters from the same goal row.

CREATE OR REPLACE FUNCTION public.record_goal_progress(
  p_goal_id uuid,
  p_user_id uuid,
  p_tracked_date date,
  p_measured_value numeric,
  p_target_met boolean,
  p_source_data jsonb,
  p_new_streak int,
  p_new_best_streak int,
  p_new_total_tracked int,
  p_new_total_met int,
  p_new_status text,
  p_new_consecutive_misses int,
  p_last_measured_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_metadata jsonb;
  v_existing_celebration boolean;
BEGIN
  -- Pull the current metadata + celebration flag so we can merge instead of
  -- clobber (mirrors the JS spread we used to do, but inside the same txn).
  SELECT metadata, celebration_delivered
    INTO v_existing_metadata, v_existing_celebration
  FROM public.twin_goals
  WHERE id = p_goal_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'goal % not found for user %', p_goal_id, p_user_id;
  END IF;

  INSERT INTO public.goal_progress_log (
    goal_id, user_id, tracked_date, measured_value, target_met, source_data
  ) VALUES (
    p_goal_id, p_user_id, p_tracked_date, p_measured_value, p_target_met, p_source_data
  )
  ON CONFLICT (goal_id, tracked_date) DO NOTHING;

  UPDATE public.twin_goals
  SET
    current_streak       = p_new_streak,
    best_streak          = p_new_best_streak,
    total_days_tracked   = p_new_total_tracked,
    total_days_met       = p_new_total_met,
    last_progress_check  = NOW(),
    last_measured_value  = p_measured_value,
    last_measured_at     = p_last_measured_at,
    status               = p_new_status,
    celebration_delivered = CASE
      WHEN p_new_status = 'completed' THEN false
      ELSE v_existing_celebration
    END,
    metadata             = COALESCE(v_existing_metadata, '{}'::jsonb)
                           || jsonb_build_object('consecutive_misses', p_new_consecutive_misses)
  WHERE id = p_goal_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_goal_progress FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_goal_progress TO service_role;

COMMENT ON FUNCTION public.record_goal_progress IS
  'Atomic progress write for trackGoalProgress. Inserts goal_progress_log + '
  'updates twin_goals counters in one transaction. See migration '
  '20260524_goals_record_progress_rpc.sql for rationale.';
