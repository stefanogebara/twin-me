-- Evidence that could describe several payments is kept outside the ledger until review.
-- Additive, owner-scoped protocol; legacy linked plans remain valid.
ALTER TABLE public.money_sightings ADD COLUMN reconciliation jsonb;
ALTER TABLE public.money_sightings ADD CONSTRAINT money_sighting_reconciliation_shape CHECK (
  reconciliation IS NULL OR (
    jsonb_typeof(reconciliation)='object' AND reconciliation->>'version'='1'
    AND reconciliation->>'state' IN ('deferred','resolved')
    AND reconciliation->>'reason'='ambiguous_weak_match'
    AND jsonb_typeof(reconciliation->'candidate_ids')='array'
    AND jsonb_array_length(reconciliation->'candidate_ids')<=50
    AND octet_length(reconciliation::text)<=8192
    AND (reconciliation->>'state'<>'deferred' OR transaction_id IS NULL)
  ) IS TRUE
);
-- Deletion leaves a resolved observation as retained history. A legacy/direct write
-- cannot revive its link. The review RPC alone links a newly resolved row in its same
-- transaction, and only after checking that the pre-transition row was deferred.
CREATE FUNCTION public.guard_money_resolved_orphan() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF OLD.reconciliation->>'state'='resolved' AND OLD.transaction_id IS NULL AND NEW.transaction_id IS NOT NULL
   AND current_setting('twinme.review_sighting',true) IS DISTINCT FROM OLD.id::text THEN
   RAISE EXCEPTION 'resolved deleted payment cannot be relinked';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_money_resolved_orphan() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER money_sightings_resolved_orphan BEFORE UPDATE ON public.money_sightings
FOR EACH ROW EXECUTE FUNCTION public.guard_money_resolved_orphan();

CREATE INDEX money_sightings_deferred_owner ON public.money_sightings(user_id,occurred_at,id)
  WHERE reconciliation->>'state'='deferred';

CREATE FUNCTION public.money_reconciliation_status(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  WITH pending AS (SELECT source,occurred_at FROM money_sightings
    WHERE user_id=p_user_id AND reconciliation->>'state'='deferred'),
  counts AS (SELECT source,count(*) AS n FROM pending GROUP BY source)
  SELECT jsonb_build_object('state',CASE WHEN count(*)>0 THEN 'pending' ELSE 'clear' END,
    'unresolvedCount',count(*),'bySource',COALESCE((SELECT jsonb_object_agg(source,n) FROM counts),'{}'::jsonb),
    'oldestOccurredAt',min(occurred_at),'newestOccurredAt',max(occurred_at),'checkedAt',now(),
    'revision',COALESCE((SELECT revision FROM money_ingestion_revisions WHERE user_id=p_user_id),0),
    'financialRevision',COALESCE((SELECT revision FROM money_score_state WHERE user_id=p_user_id),0)) FROM pending;
$$;
REVOKE ALL ON FUNCTION public.money_reconciliation_status(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.money_reconciliation_status(uuid) TO service_role;

-- Completeness changes dirty learning even though no money transaction was written.
CREATE FUNCTION public.dirty_money_deferred_scores() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner_id uuid; old_pending boolean:=false; new_pending boolean:=false;
BEGIN
  IF TG_OP<>'INSERT' THEN old_pending:=COALESCE(OLD.reconciliation->>'state'='deferred',false); END IF;
  IF TG_OP<>'DELETE' THEN new_pending:=COALESCE(NEW.reconciliation->>'state'='deferred',false); END IF;
  IF old_pending OR new_pending THEN
    IF TG_OP='UPDATE' AND old_pending=new_pending AND
      ROW(OLD.amount,OLD.currency,OLD.direction,OLD.occurred_at) IS NOT DISTINCT FROM
      ROW(NEW.amount,NEW.currency,NEW.direction,NEW.occurred_at) THEN RETURN NEW; END IF;
    owner_id:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
    IF EXISTS(SELECT FROM users WHERE id=owner_id) THEN
      INSERT INTO money_score_state(user_id,revision) VALUES(owner_id,1)
        ON CONFLICT(user_id) DO UPDATE SET revision=money_score_state.revision+1;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dirty_money_deferred_scores() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER money_sightings_deferred_dirty AFTER INSERT OR UPDATE OR DELETE ON public.money_sightings
FOR EACH ROW EXECUTE FUNCTION public.dirty_money_deferred_scores();

-- Include occurrence-suffixed temporary identities when a bank assigns stable references.
-- Owner scope and the bounded reconciliation window remain unchanged.
CREATE OR REPLACE FUNCTION public.prepare_money_ingestion(p_user_id uuid, p_sightings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_sightings) <> 'array'
     OR jsonb_array_length(p_sightings) NOT BETWEEN 1 AND 250 THEN
    RAISE EXCEPTION 'invalid ingestion request';
  END IF;
  INSERT INTO money_ingestion_revisions(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  -- One statement/snapshot: a concurrent commit cannot mix an old revision with new rows.
  WITH input AS (
    SELECT * FROM jsonb_to_recordset(p_sightings) AS s(source text, source_ref text, legacy_refs jsonb, occurred_at timestamptz)
  ), prior AS (
    SELECT s.* FROM money_sightings s WHERE s.user_id=p_user_id AND EXISTS (
      SELECT FROM input i WHERE i.source=s.source AND
        (i.source_ref=s.source_ref OR COALESCE(i.legacy_refs, '[]'::jsonb) ? s.source_ref
          OR EXISTS (SELECT FROM jsonb_array_elements_text(COALESCE(i.legacy_refs,'[]'::jsonb)) a(ref)
            WHERE (a.ref LIKE 'pend:%' OR a.ref LIKE 'bank:fallback:%')
              AND left(s.source_ref,length(a.ref)+1)=a.ref || '#'
              AND substring(s.source_ref FROM length(a.ref)+2) ~ '^[0-9]+$'))
    )
  ), candidates AS (
    SELECT t.*, prim.source AS primary_source, prim.raw_json->>'status' AS primary_status,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'source',s.source,'status',s.raw_json->>'status'))
        FROM money_sightings s WHERE s.user_id=p_user_id AND s.transaction_id=t.id), '[]'::jsonb) AS backings
    FROM money_transactions t LEFT JOIN money_sightings prim ON prim.id=t.primary_sighting_id AND prim.user_id=p_user_id
    WHERE t.user_id=p_user_id AND (
      t.occurred_at BETWEEN (SELECT min(occurred_at) - interval '4 days' FROM input)
                       AND (SELECT max(occurred_at) + interval '4 days' FROM input)
      OR t.id IN (SELECT transaction_id FROM prior)
    ) ORDER BY t.occurred_at,t.id LIMIT 10001
  )
  SELECT jsonb_build_object(
    'protocol',2,'revision', r.revision,
    'sightings', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM prior p), '[]'::jsonb),
    'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM candidates t), '[]'::jsonb)
  ) INTO result FROM money_ingestion_revisions r WHERE r.user_id=p_user_id;
  IF jsonb_array_length(result->'transactions') > 10000 THEN
    RAISE EXCEPTION 'ingestion window too large; split the import';
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.prepare_money_ingestion(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_money_ingestion(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.commit_money_ingestion(
  p_user_id uuid, p_revision bigint, p_sightings jsonb, p_creates jsonb, p_updates jsonb, p_links jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_revision bigint; affected integer;
BEGIN
  SELECT revision INTO current_revision FROM money_ingestion_revisions WHERE user_id=p_user_id FOR UPDATE;
  IF current_revision IS NULL OR current_revision <> p_revision THEN
    RAISE EXCEPTION 'money ingestion changed; retry' USING ERRCODE='PT409';
  END IF;
  IF jsonb_array_length(p_sightings) NOT BETWEEN 1 AND 250
     OR jsonb_array_length(p_creates) > 250 OR jsonb_array_length(p_updates) > 250
     OR jsonb_array_length(p_links) <> jsonb_array_length(p_sightings) THEN
    RAISE EXCEPTION 'invalid ingestion plan';
  END IF;
  -- Exact one-to-one disposition, not just equal cardinalities.
  IF (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(p_sightings) v)<>jsonb_array_length(p_sightings)
    OR (SELECT count(DISTINCT (v->>'source',v->>'source_ref')) FROM jsonb_array_elements(p_sightings) v)<>jsonb_array_length(p_sightings)
    OR (SELECT count(DISTINCT v->>'sighting_id') FROM jsonb_array_elements(p_links) v)<>jsonb_array_length(p_links)
    OR EXISTS (SELECT FROM jsonb_array_elements(p_sightings) s FULL JOIN jsonb_array_elements(p_links) l
      ON s->>'id'=l->>'sighting_id' WHERE s IS NULL OR l IS NULL OR NOT(l ? 'transaction_id'))
    OR (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(p_creates) v)<>jsonb_array_length(p_creates)
    OR (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(p_updates) v)<>jsonb_array_length(p_updates)
  THEN RAISE EXCEPTION 'duplicate or missing ingestion disposition'; END IF;
  IF EXISTS (
    SELECT FROM jsonb_array_elements(p_sightings) s JOIN jsonb_array_elements(p_links) l ON s->>'id'=l->>'sighting_id'
    LEFT JOIN money_sightings old ON old.id=(s->>'id')::uuid
    WHERE ((l->>'transaction_id') IS NULL AND COALESCE(s->'reconciliation'->>'state','')<>'deferred')
      OR ((l->>'transaction_id') IS NOT NULL AND s->'reconciliation'->>'state'='deferred')
      OR (old.transaction_id IS NOT NULL AND old.transaction_id IS DISTINCT FROM (l->>'transaction_id')::uuid)
      OR (old.reconciliation->>'state'='resolved' AND old.transaction_id IS NULL AND l->>'transaction_id' IS NOT NULL)
      OR (old.source IS NOT NULL AND old.source<>s->>'source')
      OR (old.reconciliation IS NOT NULL AND s->'reconciliation' IS DISTINCT FROM old.reconciliation
        AND NOT(old.reconciliation->>'state'='deferred' AND s->'reconciliation'->>'state'='resolved'
          AND current_setting('twinme.review_sighting',true)=old.id::text))
      OR (old.reconciliation->>'state'='deferred' AND l->>'transaction_id' IS NOT NULL
        AND current_setting('twinme.review_sighting',true) IS DISTINCT FROM old.id::text)
      OR (old.id IS NULL AND s->'reconciliation'->>'state'='resolved')
  ) THEN RAISE EXCEPTION 'invalid evidence transition'; END IF;
  IF EXISTS (
    SELECT FROM jsonb_array_elements(p_sightings) s,
      jsonb_array_elements_text(COALESCE(s->'reconciliation'->'candidate_ids','[]'::jsonb)) candidate(id)
    LEFT JOIN money_transactions t ON t.id=candidate.id::uuid AND t.user_id=p_user_id
    -- Deleted candidates can remain in existing history; new candidates must be owned.
    WHERE t.id IS NULL AND NOT EXISTS (SELECT FROM money_sightings old WHERE old.id=(s->>'id')::uuid
      AND old.user_id=p_user_id AND old.reconciliation->'candidate_ids' ? candidate.id)
  ) THEN RAISE EXCEPTION 'candidate ownership mismatch'; END IF;
  IF EXISTS (
    SELECT FROM (SELECT value AS t FROM jsonb_array_elements(p_creates)
      UNION ALL SELECT value FROM jsonb_array_elements(p_updates)) mutations
    WHERE NOT EXISTS (SELECT FROM jsonb_array_elements(p_links) l WHERE l->>'transaction_id'=t->>'id')
  ) THEN RAISE EXCEPTION 'unbacked transaction mutation'; END IF;
  IF EXISTS (
    SELECT FROM jsonb_to_recordset(p_sightings) AS s(id uuid, account_id uuid)
    LEFT JOIN money_accounts a ON a.id=s.account_id AND a.user_id=p_user_id
    LEFT JOIN money_sightings old ON old.id=s.id
    WHERE (s.account_id IS NOT NULL AND a.id IS NULL) OR (old.id IS NOT NULL AND old.user_id<>p_user_id)
  ) THEN RAISE EXCEPTION 'sighting ownership mismatch'; END IF;

  IF jsonb_array_length(p_creates)=0 AND jsonb_array_length(p_updates)=0
    AND NOT EXISTS (SELECT FROM jsonb_array_elements(p_sightings) s
      LEFT JOIN money_sightings old ON old.id=(s->>'id')::uuid AND old.user_id=p_user_id
      WHERE old.id IS NULL OR old.reconciliation->>'state' IS DISTINCT FROM 'deferred'
        OR EXISTS (SELECT FROM jsonb_each(s) kv WHERE kv.key<>'legacy_refs'
          AND CASE WHEN kv.key='occurred_at' THEN old.occurred_at IS DISTINCT FROM (s->>'occurred_at')::timestamptz
            ELSE (to_jsonb(old)->kv.key) IS DISTINCT FROM kv.value END))
  THEN RETURN jsonb_build_object('revision',current_revision); END IF;
  INSERT INTO money_sightings(id,user_id,account_id,source,source_ref,raw_text,raw_json,amount,currency,direction,merchant_raw,merchant_key,occurred_at,channel,card_last4,parse_confidence,reconciliation)
    SELECT id,p_user_id,account_id,source,source_ref,raw_text,raw_json,amount,currency,direction,merchant_raw,merchant_key,occurred_at,channel,card_last4,parse_confidence,reconciliation
    FROM jsonb_populate_recordset(NULL::money_sightings,p_sightings)
  ON CONFLICT(id) DO UPDATE SET
    account_id=EXCLUDED.account_id, reconciliation=EXCLUDED.reconciliation, source_ref=EXCLUDED.source_ref, raw_text=EXCLUDED.raw_text, raw_json=EXCLUDED.raw_json,
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
  LEFT JOIN money_transactions t ON t.id=l.transaction_id AND t.user_id=p_user_id
  WHERE s.id=l.sighting_id AND s.user_id=p_user_id
    AND (t.id IS NOT NULL OR (l.transaction_id IS NULL AND s.reconciliation->>'state'='deferred'));
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

GRANT EXECUTE ON FUNCTION public.commit_money_ingestion(uuid,bigint,jsonb,jsonb,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_money_scoring(p_user_id uuid,p_today date,p_cutoff date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_today IS NULL OR p_cutoff IS NULL OR p_cutoff>=p_today THEN RAISE EXCEPTION 'invalid scoring request'; END IF;
  INSERT INTO money_score_state(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  -- A single MVCC snapshot for revision, figures and their financial evidence.
  WITH state AS (
    SELECT *, scored_revision<>revision OR scored_cutoff IS DISTINCT FROM p_cutoff AS dirty
      FROM money_score_state WHERE user_id=p_user_id
  ), figures AS (
    SELECT * FROM money_figure_scores WHERE user_id=p_user_id AND predicted_for>=p_today-400
      ORDER BY predicted_for,predicted_on,id LIMIT 2001
  ), payments AS (
    SELECT * FROM money_transactions WHERE user_id=p_user_id AND currency='EUR'
      AND occurred_at>=date_trunc('month',(p_today-400)::timestamp) - interval '1 day'
      AND (SELECT dirty FROM state) ORDER BY occurred_at,id LIMIT 10001
  ), facts AS (
    SELECT * FROM money_facts WHERE user_id=p_user_id AND (SELECT dirty FROM state) ORDER BY id LIMIT 5001
  ), accounts AS (
    SELECT * FROM money_accounts WHERE user_id=p_user_id AND (SELECT dirty FROM state) ORDER BY id LIMIT 101
  )
  SELECT jsonb_build_object('revision',s.revision,'dirty',s.dirty,'reconciliation',public.money_reconciliation_status(p_user_id),
    'figures',COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM figures f),'[]'::jsonb),
    'transactions',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM payments t),'[]'::jsonb),
    'facts',COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM facts f),'[]'::jsonb),
    'accounts',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM accounts a),'[]'::jsonb)) INTO result FROM state s;
  IF jsonb_array_length(result->'figures')>2000 OR jsonb_array_length(result->'transactions')>10000
     OR jsonb_array_length(result->'facts')>5000 OR jsonb_array_length(result->'accounts')>100 THEN
    RAISE EXCEPTION 'scoring history exceeds the supported window';
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.commit_money_scoring(p_user_id uuid,p_revision bigint,p_cutoff date,p_changes jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_revision bigint; completed_revision bigint; completed_cutoff date; affected integer;
BEGIN
  SELECT revision,scored_revision,scored_cutoff INTO current_revision,completed_revision,completed_cutoff FROM money_score_state WHERE user_id=p_user_id FOR UPDATE;
  IF current_revision IS NULL OR current_revision<>p_revision THEN RAISE EXCEPTION 'scoring evidence changed; retry' USING ERRCODE='PT409'; END IF;
  IF completed_revision=p_revision AND completed_cutoff=p_cutoff THEN RETURN jsonb_build_object('cached',true,'revision',p_revision); END IF;
  IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>2000 THEN RAISE EXCEPTION 'invalid score changes'; END IF;
  IF EXISTS (SELECT FROM jsonb_to_recordset(p_changes) AS c(id uuid,actual numeric,scored_at timestamptz)
    LEFT JOIN money_figure_scores f ON f.id=c.id AND f.user_id=p_user_id
    WHERE f.id IS NULL OR (c.actual IS NOT NULL AND (c.actual<0 OR f.predicted_for>p_cutoff))) THEN
    RAISE EXCEPTION 'score ownership or maturity mismatch';
  END IF;
  IF EXISTS(SELECT FROM money_sightings WHERE user_id=p_user_id AND reconciliation->>'state'='deferred')
    AND EXISTS(SELECT FROM jsonb_array_elements(p_changes) c WHERE c->>'actual' IS NOT NULL) THEN
    RAISE EXCEPTION 'unresolved evidence cannot train scoring';
  END IF;
  INSERT INTO money_score_changes(user_id,figure_id,revision,before_score,after_score,changed_at)
    SELECT p_user_id,f.id,p_revision,jsonb_build_object('actual',f.actual,'error',f.error,'hit',f.hit,'scored_at',f.scored_at,'revision',f.score_revision),c,p_now
    FROM jsonb_array_elements(p_changes) c JOIN money_figure_scores f ON f.id=(c->>'id')::uuid AND f.user_id=p_user_id;
  PERFORM set_config('twinme.score_commit','on',true);
  UPDATE money_figure_scores f SET actual=c.actual,error=c.error,hit=c.hit,scored_at=c.scored_at,score_revision=p_revision
    FROM jsonb_to_recordset(p_changes) AS c(id uuid,actual numeric,error numeric,hit boolean,scored_at timestamptz)
    WHERE f.id=c.id AND f.user_id=p_user_id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM set_config('twinme.score_commit','',true);
  IF affected<>jsonb_array_length(p_changes) THEN RAISE EXCEPTION 'score update mismatch'; END IF;
  UPDATE money_score_state SET scored_revision=p_revision,scored_cutoff=p_cutoff,checked_at=p_now WHERE user_id=p_user_id;
  RETURN jsonb_build_object('changed',affected,'revision',p_revision);
END $$;
REVOKE ALL ON FUNCTION public.dirty_money_scores() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_money_scoring(uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_money_scoring(uuid,bigint,date,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_money_scoring(uuid,date,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_money_scoring(uuid,bigint,date,jsonb,timestamptz) TO service_role;

-- Same filters as the classifier, without nearest-neighbour guessing. This is used again
-- under the revision lock when the person chooses a candidate.
CREATE FUNCTION public.money_review_compatible(s public.money_sightings,t public.money_transactions)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT s.user_id=t.user_id AND s.currency=t.currency
   AND (s.account_id IS NULL OR t.account_id IS NULL OR s.account_id=t.account_id)
   AND (s.card_last4 IS NULL OR t.card_last4 IS NULL OR s.card_last4=t.card_last4)
   AND sign(t.amount)=CASE WHEN s.amount=0 THEN 0 WHEN s.direction='in' THEN 1 ELSE -1 END
   AND abs(abs(t.amount)-s.amount)<=greatest(abs(t.amount),s.amount)*0.01+0.005
   AND abs(extract(epoch FROM t.occurred_at-s.occurred_at))<=345600
   AND ((s.merchant_key='unknown' OR s.merchant_key IS NULL) <> (t.merchant_key='unknown' OR t.merchant_key IS NULL)
     OR (s.merchant_key<>'unknown' AND t.merchant_key<>'unknown'
       AND (s.merchant_key=t.merchant_key OR starts_with(s.merchant_key,t.merchant_key||' ') OR starts_with(t.merchant_key,s.merchant_key||' '))));
$$;
REVOKE ALL ON FUNCTION public.money_review_compatible(public.money_sightings,public.money_transactions) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.money_review_compatible(public.money_sightings,public.money_transactions) TO service_role;

CREATE FUNCTION public.money_reconciliation_review(p_user_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF p_offset NOT BETWEEN 0 AND 20000 OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid review page'; END IF;
 WITH pending AS (SELECT * FROM money_sightings WHERE user_id=p_user_id AND reconciliation->>'state'='deferred'),
 page AS (SELECT * FROM pending ORDER BY occurred_at,id OFFSET p_offset LIMIT p_limit),
 items AS (SELECT s.id,s.source,CASE WHEN s.direction='in' THEN s.amount ELSE -s.amount END AS amount,s.currency,s.occurred_at,COALESCE(s.merchant_raw,s.merchant_key) AS merchant,
   COALESCE((SELECT jsonb_agg(c) FROM (
     SELECT t.id,COALESCE(t.merchant_name,t.merchant_raw,t.merchant_key) AS merchant,t.amount,t.currency,t.occurred_at,
       CASE WHEN a.id IS NOT NULL THEN concat_ws(' ',a.bank_name,right(a.iban_mask,4)) END AS "accountLabel"
     FROM money_transactions t LEFT JOIN money_accounts a ON a.id=t.account_id AND a.user_id=p_user_id
     WHERE t.user_id=p_user_id AND t.occurred_at BETWEEN s.occurred_at-interval '4 days' AND s.occurred_at+interval '4 days' AND money_review_compatible(s,t)
       AND NOT EXISTS(SELECT FROM money_sightings other WHERE other.user_id=p_user_id AND other.transaction_id=t.id AND other.source=s.source)
     ORDER BY t.occurred_at,t.id LIMIT 50
   ) c),'[]'::jsonb) AS candidates,
   (SELECT count(*)>50 FROM money_transactions t WHERE t.user_id=p_user_id AND t.occurred_at BETWEEN s.occurred_at-interval '4 days' AND s.occurred_at+interval '4 days' AND money_review_compatible(s,t)
     AND NOT EXISTS(SELECT FROM money_sightings other WHERE other.user_id=p_user_id AND other.transaction_id=t.id AND other.source=s.source)) AS "candidateOverflow"
   FROM page s)
 SELECT jsonb_build_object('revision',COALESCE((SELECT revision FROM money_ingestion_revisions WHERE user_id=p_user_id),0),
   'items',COALESCE((SELECT jsonb_agg(i) FROM items i),'[]'::jsonb),
   'remaining',greatest(0,(SELECT count(*) FROM pending)-p_offset-p_limit),
   'nextOffset',CASE WHEN (SELECT count(*) FROM pending)>p_offset+p_limit THEN p_offset+p_limit END) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.money_reconciliation_review(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.money_reconciliation_review(uuid,integer,integer) TO service_role;

-- Explicit review changes identity certainty, not source precedence. Keep the same
-- ingestion-owned promotion as ledger.reconcile(); parity cases exercise both implementations.
CREATE FUNCTION public.money_review_promotion(s public.money_sightings,t public.money_transactions)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE prim money_sightings; incoming numeric; current_priority numeric; settled boolean; patch jsonb;
BEGIN
 SELECT * INTO prim FROM money_sightings WHERE id=t.primary_sighting_id AND user_id=s.user_id;
 settled:=s.source='statement' OR (s.source='bankfeed' AND upper(COALESCE(s.raw_json->>'status','BOOK'))<>'PDNG');
 incoming:=CASE WHEN s.source='bankfeed' AND NOT settled THEN 1.5
   WHEN s.source='bankfeed' THEN 3 WHEN s.source='statement' THEN 2 WHEN s.source='gmail' THEN 0 ELSE 1 END;
 current_priority:=CASE WHEN prim.source='bankfeed' AND prim.raw_json->>'status'='PDNG' THEN 1.5
   WHEN prim.source='bankfeed' THEN 3 WHEN prim.source='statement' THEN 2 WHEN prim.source='gmail' THEN 0
   WHEN prim.source IS NULL THEN -1 ELSE 1 END;
 patch:=jsonb_build_object('id',t.id);
 IF NOT(s.source='bankfeed' AND NOT settled AND t.posted_at IS NOT NULL)
   AND (incoming>current_priority OR t.primary_sighting_id=s.id OR (s.source='bankfeed' AND settled AND t.posted_at IS NULL)) THEN
   patch:=patch || jsonb_build_object('amount',CASE WHEN s.direction='in' THEN s.amount ELSE -s.amount END,'primary_sighting_id',s.id);
   IF settled THEN patch:=patch || jsonb_build_object('posted_at',s.occurred_at); END IF;
   IF COALESCE(s.merchant_raw,'')<>'' AND (COALESCE(t.merchant_raw,'')='' OR s.source='bankfeed') THEN
     patch:=patch || jsonb_build_object('merchant_raw',s.merchant_raw);
     IF COALESCE(s.merchant_key,'')<>'' AND s.merchant_key<>'unknown' THEN
       patch:=patch || jsonb_build_object('merchant_key',s.merchant_key);
     END IF;
   END IF;
 END IF;
 IF s.source IN ('phone','bizum') AND t.posted_at IS NOT NULL THEN patch:=patch || jsonb_build_object('occurred_at',s.occurred_at); END IF;
 IF settled AND t.posted_at IS NULL THEN patch:=patch || jsonb_build_object('posted_at',s.occurred_at); END IF;
 IF COALESCE(t.card_last4,'')='' AND COALESCE(s.card_last4,'')<>'' THEN patch:=patch || jsonb_build_object('card_last4',s.card_last4); END IF;
 IF t.account_id IS NULL AND s.account_id IS NOT NULL THEN patch:=patch || jsonb_build_object('account_id',s.account_id); END IF;
 RETURN patch;
END $$;
REVOKE ALL ON FUNCTION public.money_review_promotion(public.money_sightings,public.money_transactions) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.money_review_promotion(public.money_sightings,public.money_transactions) TO service_role;

CREATE FUNCTION public.resolve_money_reconciliation(p_user_id uuid,p_sighting_id uuid,p_revision bigint,p_action text,p_transaction_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_revision bigint; s money_sightings; t money_transactions; saved jsonb; creates jsonb:='[]'; updates jsonb:='[]'; result jsonb;
BEGIN
 SELECT revision INTO current_revision FROM money_ingestion_revisions WHERE user_id=p_user_id FOR UPDATE;
 IF current_revision IS NULL OR current_revision<>p_revision THEN RAISE EXCEPTION 'evidence changed' USING ERRCODE='PT409'; END IF;
 SELECT * INTO s FROM money_sightings WHERE id=p_sighting_id AND user_id=p_user_id FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'review absent' USING ERRCODE='P0002'; END IF;
 IF s.reconciliation->>'state' IS DISTINCT FROM 'deferred' THEN RAISE EXCEPTION 'already reviewed' USING ERRCODE='PT409'; END IF;
 IF p_action='match' AND p_transaction_id IS NOT NULL THEN
   SELECT * INTO t FROM money_transactions WHERE id=p_transaction_id AND user_id=p_user_id FOR UPDATE;
   IF t.id IS NULL OR NOT COALESCE(money_review_compatible(s,t),false)
     OR EXISTS(SELECT FROM money_sightings other WHERE other.user_id=p_user_id AND other.transaction_id=t.id AND other.source=s.source)
   THEN RAISE EXCEPTION 'review candidate changed' USING ERRCODE='PT409'; END IF;
   updates:=jsonb_build_array(money_review_promotion(s,t));
 ELSIF p_action='separate' AND p_transaction_id IS NULL THEN
   p_transaction_id:=gen_random_uuid();
   creates:=jsonb_build_array(jsonb_build_object('id',p_transaction_id,'account_id',s.account_id,'primary_sighting_id',s.id,
     'occurred_at',s.occurred_at,'posted_at',CASE WHEN s.source='statement' OR (s.source='bankfeed' AND upper(COALESCE(s.raw_json->>'status','BOOK'))<>'PDNG') THEN s.occurred_at END,
     'amount',CASE WHEN s.direction='in' THEN s.amount ELSE -s.amount END,'currency',s.currency,
     'merchant_raw',s.merchant_raw,'merchant_key',s.merchant_key,'channel',s.channel,'card_last4',s.card_last4));
 ELSE RAISE EXCEPTION 'invalid review action'; END IF;
 saved:=to_jsonb(s)-'transaction_id';
 saved:=jsonb_set(saved,'{reconciliation}',s.reconciliation || jsonb_build_object('state','resolved',
   'resolution',jsonb_build_object('kind',CASE WHEN p_action='match' THEN 'user_match' ELSE 'user_separate' END,'at',now())));
 PERFORM set_config('twinme.review_sighting',s.id::text,true);
 result:=commit_money_ingestion(p_user_id,p_revision,jsonb_build_array(saved),creates,updates,
   jsonb_build_array(jsonb_build_object('sighting_id',s.id,'transaction_id',p_transaction_id)));
 PERFORM set_config('twinme.review_sighting','',true);
 RETURN result || jsonb_build_object('resolved',true,'transactionId',p_transaction_id);
END $$;
REVOKE ALL ON FUNCTION public.resolve_money_reconciliation(uuid,uuid,bigint,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_money_reconciliation(uuid,uuid,bigint,text,uuid) TO service_role;

-- All derived publications share the same owner lock as ingestion: ambiguity cannot
-- enter between checking completeness and publishing a financial prediction.
CREATE FUNCTION public.lock_money_complete(p_user_id uuid,p_revision bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r bigint;
BEGIN
 INSERT INTO money_ingestion_revisions(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO r FROM money_ingestion_revisions WHERE user_id=p_user_id FOR UPDATE;
 IF (p_revision IS NOT NULL AND r<>p_revision) OR EXISTS(SELECT FROM money_sightings WHERE user_id=p_user_id AND reconciliation->>'state'='deferred') THEN
   RAISE EXCEPTION 'financial evidence changed or needs review' USING ERRCODE='PT409';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.lock_money_complete(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lock_money_complete(uuid,bigint) TO service_role;
CREATE FUNCTION public.guard_money_publication() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 PERFORM lock_money_complete(NEW.user_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_money_publication() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER money_predictions_complete BEFORE INSERT OR UPDATE ON public.money_predictions FOR EACH ROW EXECUTE FUNCTION public.guard_money_publication();
CREATE TRIGGER money_readings_complete BEFORE INSERT OR UPDATE ON public.money_readings FOR EACH ROW EXECUTE FUNCTION public.guard_money_publication();
CREATE TRIGGER money_forecasts_complete BEFORE INSERT OR UPDATE ON public.money_forecasts FOR EACH ROW EXECUTE FUNCTION public.guard_money_publication();

CREATE FUNCTION public.commit_money_prediction_issue(p_user_id uuid,p_revision bigint,p_financial_revision bigint,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 PERFORM lock_money_complete(p_user_id,p_revision);
 INSERT INTO money_score_state(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM money_score_state WHERE user_id=p_user_id AND revision=p_financial_revision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial evidence changed' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>100 OR EXISTS(
   SELECT FROM jsonb_array_elements(p_rows) v WHERE (v->>'user_id')::uuid IS DISTINCT FROM p_user_id
 ) THEN RAISE EXCEPTION 'invalid prediction issue'; END IF;
 INSERT INTO money_figure_scores(user_id,kind,predicted_for,predicted_on,value,low,high,predicted_at,issued_low,issued_high)
 SELECT p_user_id,kind,predicted_for,predicted_on,value,low,high,predicted_at,issued_low,issued_high
 FROM jsonb_populate_recordset(NULL::money_figure_scores,p_rows)
 ON CONFLICT(user_id,kind,predicted_for,predicted_on) DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN jsonb_build_object('recorded',affected);
END $$;
REVOKE ALL ON FUNCTION public.commit_money_prediction_issue(uuid,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_money_prediction_issue(uuid,bigint,bigint,jsonb) TO service_role;

CREATE FUNCTION public.commit_money_charge_scores(p_user_id uuid,p_revision bigint,p_financial_revision bigint,p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 PERFORM lock_money_complete(p_user_id,p_revision);
 INSERT INTO money_score_state(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM money_score_state WHERE user_id=p_user_id AND revision=p_financial_revision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial evidence changed' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>2000
   OR (SELECT count(DISTINCT c->>'id') FROM jsonb_array_elements(p_changes) c)<>jsonb_array_length(p_changes)
   OR EXISTS(SELECT FROM jsonb_array_elements(p_changes) c LEFT JOIN money_predictions p ON p.id=(c->>'id')::uuid AND p.user_id=p_user_id WHERE p.id IS NULL)
 THEN RAISE EXCEPTION 'invalid charge score ownership'; END IF;
 UPDATE money_predictions p SET happened=c.happened,happened_on=c.happened_on,happened_amount=c.happened_amount,scored_at=c.scored_at
 FROM jsonb_to_recordset(p_changes) AS c(id uuid,happened boolean,happened_on date,happened_amount numeric,scored_at timestamptz)
 WHERE p.id=c.id AND p.user_id=p_user_id;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>jsonb_array_length(p_changes) THEN RAISE EXCEPTION 'charge score update mismatch'; END IF;
 RETURN jsonb_build_object('scored',affected);
END $$;
REVOKE ALL ON FUNCTION public.commit_money_charge_scores(uuid,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_money_charge_scores(uuid,bigint,bigint,jsonb) TO service_role;
