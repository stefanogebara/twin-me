-- Enable RLS on PII tables exposed via PostgREST (audit 2026-06, Milestone 0.3)
-- ===================================================================
-- The 2026-06 audit + Supabase security advisor found these tables in the
-- public schema with RLS DISABLED, i.e. readable/writable through the anon
-- PostgREST key shipped to every browser:
--   - reminders            : reminder bodies, source
--   - twin_calls           : dialed E.164 numbers, goals, call transcripts, outcomes
--   - whatsmeow_*           : WhatsApp E2E session keys, identity keys, pre-keys,
--                             message secrets, privacy tokens (session compromise == DB compromise)
--
-- Fix: enable RLS + a service_role-only policy on each, matching the established
-- pattern (20260606_create_platform_exports.sql:66-70). This is deny-by-default
-- once enabled and LOW RISK because every legitimate consumer bypasses RLS:
--   - the API backend uses supabaseAdmin (service_role -> BYPASSRLS)
--   - the Go WhatsApp bridge connects via DATABASE_URL (Supabase pooler, the
--     `postgres` owner role -> BYPASSRLS), NOT the PostgREST anon path
-- so enabling RLS closes the anon REST leak without touching either runtime.
--
-- Idempotent: guarded by a table-existence check and DROP POLICY IF EXISTS, so
-- it is safe to re-run and tolerant of whatsmeow tables the Go library may add
-- or rename across versions.
--
-- NOT included (deliberately): campaign_recipients, customer_consent — also
-- flagged by the advisor but referenced NOWHERE in this codebase (unknown
-- provenance). Gating them could break an external consumer we cannot see;
-- left for a follow-up decision (enable, or drop if dead).

DO $$
DECLARE
  t text;
  pii_tables text[] := ARRAY[
    'reminders',
    'twin_calls',
    'whatsmeow_version',
    'whatsmeow_pre_keys',
    'whatsmeow_device',
    'whatsmeow_identity_keys',
    'whatsmeow_sessions',
    'whatsmeow_sender_keys',
    'whatsmeow_app_state_sync_keys',
    'whatsmeow_app_state_version',
    'whatsmeow_app_state_mutation_macs',
    'whatsmeow_contacts',
    'whatsmeow_chat_settings',
    'whatsmeow_message_secrets',
    'whatsmeow_privacy_tokens',
    'whatsmeow_nct_salt',
    'whatsmeow_lid_map',
    'whatsmeow_event_buffer',
    'whatsmeow_retry_buffer'
  ];
BEGIN
  FOREACH t IN ARRAY pii_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS service_role_full_access ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY service_role_full_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;
