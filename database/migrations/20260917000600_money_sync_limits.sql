ALTER TABLE public.money_accounts ADD COLUMN IF NOT EXISTS sync_checkpoint jsonb;
CREATE TABLE IF NOT EXISTS public.money_sync_jobs (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  next_due_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
  last_outcome text, last_finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.money_feed_leases (
  account_id uuid PRIMARY KEY REFERENCES public.money_accounts(id) ON DELETE CASCADE,
  lease_until timestamptz
);
ALTER TABLE public.money_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_feed_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.money_sync_jobs,public.money_feed_leases FROM anon,authenticated;
GRANT ALL ON public.money_sync_jobs,public.money_feed_leases TO service_role;
CREATE POLICY money_sync_service_all ON public.money_sync_jobs FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE POLICY money_feed_lease_service_all ON public.money_feed_leases FOR ALL TO service_role USING(true) WITH CHECK(true);

CREATE OR REPLACE FUNCTION public.claim_money_sync_jobs(p_limit integer DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  INSERT INTO money_sync_jobs(user_id) SELECT DISTINCT user_id FROM money_accounts WHERE provider='enablebanking' ON CONFLICT DO NOTHING;
  WITH eligible AS (
    SELECT j.user_id FROM money_sync_jobs j WHERE j.next_due_at<=now() AND (j.lease_until IS NULL OR j.lease_until<now())
      AND EXISTS(SELECT FROM money_accounts a WHERE a.user_id=j.user_id AND a.provider='enablebanking')
    ORDER BY j.next_due_at,j.user_id LIMIT LEAST(GREATEST(p_limit,1),3) FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE money_sync_jobs j SET lease_until=now()+interval '2 minutes' FROM eligible e WHERE j.user_id=e.user_id RETURNING j.user_id
  ) SELECT COALESCE(jsonb_agg(user_id),'[]'::jsonb) INTO result FROM claimed;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.finish_money_sync_job(p_user_id uuid,p_outcome text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
  UPDATE money_sync_jobs SET lease_until=NULL,last_outcome=p_outcome,last_finished_at=now(),
    next_due_at=now()+CASE WHEN p_outcome='ok' THEN interval '8 hours' ELSE interval '1 hour' END WHERE user_id=p_user_id;
$$;
CREATE OR REPLACE FUNCTION public.reserve_money_feed_read(p_user_id uuid,p_account_id uuid,p_attended boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE expires timestamptz; session text; access_id uuid; used integer;
BEGIN
  SELECT COALESCE(session_id,id::text) INTO session FROM money_accounts WHERE id=p_account_id AND user_id=p_user_id;
  IF session IS NULL THEN RAISE EXCEPTION 'bank account ownership mismatch'; END IF;
  -- All accounts in one consent share the same unattended budget.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||session,0));
  INSERT INTO money_feed_leases(account_id) VALUES(p_account_id) ON CONFLICT DO NOTHING;
  SELECT lease_until INTO expires FROM money_feed_leases WHERE account_id=p_account_id FOR UPDATE;
  IF expires>now() THEN RETURN jsonb_build_object('allowed',false,'reason','already_reading'); END IF;
  IF NOT p_attended THEN
    SELECT count(*) INTO used FROM money_feed_accesses f LEFT JOIN money_accounts a ON a.id=f.account_id
      WHERE f.user_id=p_user_id AND NOT f.attended AND f.at>now()-interval '24 hours'
      AND (f.account_id IS NULL OR COALESCE(a.session_id,a.id::text)=session);
    IF used>=4 THEN RETURN jsonb_build_object('allowed',false,'reason','feed_budget_spent'); END IF;
  END IF;
  INSERT INTO money_feed_accesses(user_id,account_id,attended,outcome) VALUES(p_user_id,p_account_id,p_attended,'started') RETURNING id INTO access_id;
  UPDATE money_feed_leases SET lease_until=now()+interval '55 seconds' WHERE account_id=p_account_id;
  RETURN jsonb_build_object('allowed',true,'access_id',access_id);
END $$;
REVOKE ALL ON FUNCTION public.claim_money_sync_jobs(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_money_sync_job(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_money_feed_read(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_money_sync_jobs(integer),public.finish_money_sync_job(uuid,text),public.reserve_money_feed_read(uuid,uuid,boolean) TO service_role;
