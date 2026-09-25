-- PostgREST 14 internally retries SQLSTATE 40001 with the same arguments. A stale
-- optimistic revision can therefore loop forever without reaching the bounded JS retry.
-- PT409 is an application conflict (HTTP 409), not a database serialization failure.
-- Derive each replacement from its installed definition: safe before or after the
-- additive deferred-evidence migration; preserves signatures, security and grants.
DO $migration$
DECLARE target record; definition text;
BEGIN
  FOR target IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'commit_money_ingestion','commit_money_scoring','resolve_money_reconciliation',
      'lock_money_complete','commit_money_prediction_issue','commit_money_charge_scores'
    )
  LOOP
    definition:=pg_get_functiondef(target.oid);
    IF position('''40001''' in definition)>0 THEN
      EXECUTE replace(definition,'''40001''','''PT409''');
    END IF;
  END LOOP;
END $migration$;
