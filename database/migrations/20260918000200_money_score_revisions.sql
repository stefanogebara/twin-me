-- Dirty revisions survive failures and span every source of financial changes, including
-- SQL repairs. Scoring commits atomically against the revision it actually read.
CREATE TABLE public.money_score_state (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0,
  scored_revision bigint NOT NULL DEFAULT -1,
  scored_cutoff date,
  checked_at timestamptz
);
CREATE TABLE public.money_score_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  figure_id uuid NOT NULL REFERENCES public.money_figure_scores(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  before_score jsonb NOT NULL,
  after_score jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX money_score_changes_owner ON public.money_score_changes(user_id,changed_at DESC);
ALTER TABLE public.money_figure_scores ADD COLUMN score_revision bigint;
ALTER TABLE public.money_figure_scores ADD COLUMN issued_low numeric(12,2);
ALTER TABLE public.money_figure_scores ADD COLUMN issued_high numeric(12,2);
CREATE INDEX money_figures_owner_period ON public.money_figure_scores(user_id,predicted_for,predicted_on,id);
ALTER TABLE public.money_score_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_score_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.money_score_state, public.money_score_changes FROM anon, authenticated;
GRANT ALL ON public.money_score_state, public.money_score_changes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.money_score_changes_id_seq TO service_role;
CREATE POLICY money_score_state_service ON public.money_score_state FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY money_score_changes_service ON public.money_score_changes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.dirty_money_scores() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid;
BEGIN
  IF TG_TABLE_NAME='money_figure_scores' AND TG_OP='UPDATE' AND current_setting('twinme.score_commit',true)='on' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN RETURN NEW; END IF;
  owner_id := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF EXISTS (SELECT FROM users WHERE id=owner_id) THEN
    INSERT INTO money_score_state(user_id,revision) VALUES(owner_id,1)
      ON CONFLICT(user_id) DO UPDATE SET revision=money_score_state.revision+1;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_transactions_dirty_scores AFTER INSERT OR UPDATE OR DELETE ON public.money_transactions FOR EACH ROW EXECUTE FUNCTION public.dirty_money_scores();
CREATE TRIGGER money_facts_dirty_scores AFTER INSERT OR UPDATE OR DELETE ON public.money_facts FOR EACH ROW EXECUTE FUNCTION public.dirty_money_scores();
CREATE TRIGGER money_accounts_dirty_scores AFTER INSERT OR UPDATE OR DELETE ON public.money_accounts FOR EACH ROW EXECUTE FUNCTION public.dirty_money_scores();
CREATE TRIGGER money_figures_dirty_scores AFTER INSERT OR UPDATE OR DELETE ON public.money_figure_scores FOR EACH ROW EXECUTE FUNCTION public.dirty_money_scores();

CREATE FUNCTION public.prepare_money_scoring(p_user_id uuid,p_today date,p_cutoff date)
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
  SELECT jsonb_build_object('revision',s.revision,'dirty',s.dirty,
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

CREATE FUNCTION public.commit_money_scoring(p_user_id uuid,p_revision bigint,p_cutoff date,p_changes jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_revision bigint; completed_revision bigint; completed_cutoff date; affected integer;
BEGIN
  SELECT revision,scored_revision,scored_cutoff INTO current_revision,completed_revision,completed_cutoff FROM money_score_state WHERE user_id=p_user_id FOR UPDATE;
  IF current_revision IS NULL OR current_revision<>p_revision THEN RAISE EXCEPTION 'scoring evidence changed; retry' USING ERRCODE='40001'; END IF;
  IF completed_revision=p_revision AND completed_cutoff=p_cutoff THEN RETURN jsonb_build_object('cached',true,'revision',p_revision); END IF;
  IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>2000 THEN RAISE EXCEPTION 'invalid score changes'; END IF;
  IF EXISTS (SELECT FROM jsonb_to_recordset(p_changes) AS c(id uuid,actual numeric,scored_at timestamptz)
    LEFT JOIN money_figure_scores f ON f.id=c.id AND f.user_id=p_user_id
    WHERE f.id IS NULL OR (c.actual IS NOT NULL AND (c.actual<0 OR f.predicted_for>p_cutoff))) THEN
    RAISE EXCEPTION 'score ownership or maturity mismatch';
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
