ALTER TABLE public.money_accounts ADD COLUMN IF NOT EXISTS account_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS money_account_fingerprint_key ON public.money_accounts(user_id,provider,account_fingerprint) WHERE account_fingerprint IS NOT NULL;
CREATE OR REPLACE FUNCTION public.save_money_bank_account(p_user_id uuid,p_account jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE row public.money_accounts; fingerprint text := p_account->>'account_fingerprint';
BEGIN
  IF p_user_id IS NULL OR NULLIF(p_account->>'provider_account_id','') IS NULL THEN RAISE EXCEPTION 'account owner and provider id required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
  SELECT * INTO row FROM money_accounts WHERE user_id=p_user_id AND provider='enablebanking'
    AND (provider_account_id=p_account->>'provider_account_id' OR (fingerprint IS NOT NULL AND account_fingerprint=fingerprint))
    ORDER BY created_at LIMIT 1;
  -- Reconnect updates consent on the same local account id; no historical ledger rewrite.
  IF row.id IS NULL THEN
    INSERT INTO money_accounts(user_id,provider,provider_account_id) VALUES(p_user_id,'enablebanking',p_account->>'provider_account_id') RETURNING * INTO row;
  END IF;
  UPDATE money_accounts SET provider_account_id=p_account->>'provider_account_id',
    account_fingerprint=COALESCE(fingerprint,account_fingerprint),name=p_account->>'name',currency=p_account->>'currency',
    iban_mask=p_account->>'iban_mask',consent_expires_at=(p_account->>'consent_expires_at')::timestamptz,
    session_id=p_account->>'session_id',bank_name=p_account->>'bank_name',
    sync_checkpoint=CASE WHEN provider_account_id=p_account->>'provider_account_id' THEN sync_checkpoint ELSE NULL END
  WHERE id=row.id AND user_id=p_user_id RETURNING * INTO row;
  RETURN to_jsonb(row);
END $$;
REVOKE ALL ON FUNCTION public.save_money_bank_account(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_money_bank_account(uuid,jsonb) TO service_role;
