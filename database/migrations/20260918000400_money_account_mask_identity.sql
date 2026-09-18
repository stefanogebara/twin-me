-- One account, one row, even before it had a fingerprint.
--
-- Every bank session mints a new provider id for the same account, so save_money_bank_account
-- holds an account together by its fingerprint (the IBAN, hashed, with the currency). Rows
-- opened before that column existed carry none, and nothing else identified them, so a
-- reconnect opened a second row for one account: ES53 **** 7516 was held twice, one row with
-- the balance and the payments since the 6th, the other with the 88 before it and no balance
-- at all. A balance that cannot be read for every account is withheld, so the day fell back
-- to the income the person had typed.
--
-- The mask and the currency identify a row that has nothing stronger. The fallback applies
-- only to a row whose fingerprint is still null -- a row that already has one is a different
-- account whatever its mask looks like -- and the save writes a fingerprint as it goes, so a
-- row needs the fallback once and never again.
CREATE OR REPLACE FUNCTION public.save_money_bank_account(p_user_id uuid,p_account jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE row public.money_accounts; fingerprint text := p_account->>'account_fingerprint';
BEGIN
  IF p_user_id IS NULL OR NULLIF(p_account->>'provider_account_id','') IS NULL THEN RAISE EXCEPTION 'account owner and provider id required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
  SELECT * INTO row FROM money_accounts WHERE user_id=p_user_id AND provider='enablebanking'
    AND (provider_account_id=p_account->>'provider_account_id'
      OR (fingerprint IS NOT NULL AND account_fingerprint=fingerprint)
      OR (account_fingerprint IS NULL
        AND NULLIF(p_account->>'iban_mask','') IS NOT NULL
        AND iban_mask=p_account->>'iban_mask'
        AND currency IS NOT DISTINCT FROM p_account->>'currency'))
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
