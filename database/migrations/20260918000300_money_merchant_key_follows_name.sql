-- The key travels with the name.
--
-- commit_money_ingestion applied merchant_raw from a plan but never merchant_key, so a line
-- that took the bank's better name kept the key it was created with. Matching, the repeating
-- charges and the categories all read the key, so the two said different things for ever and
-- a name corrected at the source never reached a line already stored: "Internet En Mpass"
-- stayed the shop's name beside the phone's "MPASS", and the month counted one payment twice.
--
-- merchant_key is ingestion-owned, like merchant_raw. merchant_name (the person's own name
-- for a shop), the category, the verdict and the recurring flag stay untouched.
CREATE OR REPLACE FUNCTION public.commit_money_ingestion(
  p_user_id uuid, p_revision bigint, p_sightings jsonb, p_creates jsonb, p_updates jsonb, p_links jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_revision bigint; affected integer;
BEGIN
  SELECT revision INTO current_revision FROM money_ingestion_revisions WHERE user_id=p_user_id FOR UPDATE;
  IF current_revision IS NULL OR current_revision <> p_revision THEN
    RAISE EXCEPTION 'money ingestion changed; retry' USING ERRCODE='40001';
  END IF;
  IF jsonb_array_length(p_sightings) NOT BETWEEN 1 AND 250
     OR jsonb_array_length(p_creates) > 250 OR jsonb_array_length(p_updates) > 250
     OR jsonb_array_length(p_links) <> jsonb_array_length(p_sightings) THEN
    RAISE EXCEPTION 'invalid ingestion plan';
  END IF;
  IF EXISTS (
    SELECT FROM jsonb_to_recordset(p_sightings) AS s(id uuid, account_id uuid)
    LEFT JOIN money_accounts a ON a.id=s.account_id AND a.user_id=p_user_id
    LEFT JOIN money_sightings old ON old.id=s.id
    WHERE (s.account_id IS NOT NULL AND a.id IS NULL) OR (old.id IS NOT NULL AND old.user_id<>p_user_id)
  ) THEN RAISE EXCEPTION 'sighting ownership mismatch'; END IF;

  INSERT INTO money_sightings(id,user_id,account_id,source,source_ref,raw_text,raw_json,amount,currency,direction,merchant_raw,merchant_key,occurred_at,channel,card_last4,parse_confidence)
    SELECT id,p_user_id,account_id,source,source_ref,raw_text,raw_json,amount,currency,direction,merchant_raw,merchant_key,occurred_at,channel,card_last4,parse_confidence
    FROM jsonb_populate_recordset(NULL::money_sightings,p_sightings)
  ON CONFLICT(id) DO UPDATE SET
    source_ref=EXCLUDED.source_ref, raw_text=EXCLUDED.raw_text, raw_json=EXCLUDED.raw_json,
    amount=EXCLUDED.amount, currency=EXCLUDED.currency, direction=EXCLUDED.direction,
    merchant_raw=EXCLUDED.merchant_raw, merchant_key=EXCLUDED.merchant_key, occurred_at=EXCLUDED.occurred_at,
    channel=EXCLUDED.channel, card_last4=EXCLUDED.card_last4, parse_confidence=EXCLUDED.parse_confidence;

  INSERT INTO money_transactions(id,user_id,account_id,occurred_at,posted_at,amount,currency,merchant_raw,merchant_key,channel,card_last4,primary_sighting_id)
    SELECT id,p_user_id,account_id,occurred_at,posted_at,amount,currency,merchant_raw,merchant_key,channel,card_last4,primary_sighting_id
    FROM jsonb_populate_recordset(NULL::money_transactions,p_creates);

  -- Only ingestion-owned fields. Never overwrite a category, name, verdict or recurring flag.
  UPDATE money_transactions t SET
    account_id=CASE WHEN u ? 'account_id' THEN (u->>'account_id')::uuid ELSE t.account_id END,
    occurred_at=CASE WHEN u ? 'occurred_at' THEN (u->>'occurred_at')::timestamptz ELSE t.occurred_at END,
    posted_at=CASE WHEN u ? 'posted_at' THEN (u->>'posted_at')::timestamptz ELSE t.posted_at END,
    amount=CASE WHEN u ? 'amount' THEN (u->>'amount')::numeric ELSE t.amount END,
    merchant_raw=CASE WHEN u ? 'merchant_raw' THEN u->>'merchant_raw' ELSE t.merchant_raw END,
    merchant_key=CASE WHEN u ? 'merchant_key' THEN u->>'merchant_key' ELSE t.merchant_key END,
    primary_sighting_id=CASE WHEN u ? 'primary_sighting_id' THEN (u->>'primary_sighting_id')::uuid ELSE t.primary_sighting_id END,
    card_last4=CASE WHEN u ? 'card_last4' THEN u->>'card_last4' ELSE t.card_last4 END,
    updated_at=now()
  FROM jsonb_array_elements(p_updates) u WHERE t.id=(u->>'id')::uuid AND t.user_id=p_user_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> jsonb_array_length(p_updates) THEN RAISE EXCEPTION 'transaction update mismatch'; END IF;

  UPDATE money_sightings s SET transaction_id=l.transaction_id
  FROM jsonb_to_recordset(p_links) AS l(sighting_id uuid, transaction_id uuid)
  JOIN money_transactions t ON t.id=l.transaction_id AND t.user_id=p_user_id
  WHERE s.id=l.sighting_id AND s.user_id=p_user_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> jsonb_array_length(p_links) THEN RAISE EXCEPTION 'evidence link mismatch'; END IF;
  IF EXISTS (
    SELECT FROM money_transactions t
    LEFT JOIN money_sightings s ON s.id=t.primary_sighting_id AND s.user_id=p_user_id AND s.transaction_id=t.id
    LEFT JOIN money_accounts a ON a.id=t.account_id AND a.user_id=p_user_id
    WHERE t.id IN (SELECT (v->>'transaction_id')::uuid FROM jsonb_array_elements(p_links) v)
      AND (s.id IS NULL OR (t.account_id IS NOT NULL AND a.id IS NULL))
  ) THEN RAISE EXCEPTION 'transaction ownership or evidence mismatch'; END IF;
  UPDATE money_ingestion_revisions SET revision=revision+1 WHERE user_id=p_user_id;
  RETURN jsonb_build_object('revision',current_revision+1);
END $$;
REVOKE ALL ON FUNCTION public.commit_money_ingestion(uuid,bigint,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
