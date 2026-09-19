-- The public key gets nothing from the ledger.
--
-- Supabase grants every new table in public to anon and authenticated by default, so the
-- anon role -- whose key ships in the browser bundle -- held INSERT, UPDATE, DELETE and
-- TRUNCATE on money_transactions and every other money table, with row level security as
-- the only thing between it and everyone's payments. RLS is on for all of them and today it
-- answers the anon key with zero rows; but one mistaken policy (USING (true) on the wrong
-- table, as money_merchants_read legitimately does) would open every ledger to the public
-- key. No client ever reads these tables with the anon key: the web app talks to the API,
-- and the API uses the service role. So anon is revoked outright, and RLS becomes defence in
-- depth instead of the only defence (audit 2026-09-19, S3).
--
-- authenticated keeps what its policies allow (select_own), because the mobile app may one
-- day read its own rows directly. Nothing here changes what any user can see today.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'money\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
  END LOOP;
END $$;
-- New money tables must not inherit the default either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
