-- Keyset pagination avoids the implicit PostgREST 1,000-row ceiling and shifting offsets.
CREATE OR REPLACE FUNCTION public.money_ledger_page(
  p_user_id uuid, p_since timestamptz DEFAULT NULL,
  p_before_time timestamptz DEFAULT NULL, p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 201, p_currency text DEFAULT NULL
) RETURNS SETOF public.money_transactions LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT t.* FROM money_transactions t WHERE t.user_id=p_user_id
    AND (p_since IS NULL OR t.occurred_at>=p_since)
    AND (p_before_time IS NULL OR (t.occurred_at,t.id)<(p_before_time,p_before_id))
    AND (p_currency IS NULL OR t.currency=p_currency)
  ORDER BY t.occurred_at DESC,t.id DESC LIMIT LEAST(GREATEST(p_limit,1),501)
$$;
REVOKE ALL ON FUNCTION public.money_ledger_page(uuid,timestamptz,timestamptz,uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.money_ledger_page(uuid,timestamptz,timestamptz,uuid,integer,text) TO service_role;
