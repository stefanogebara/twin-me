-- =====================================================================
-- 20260519_whatsapp_voice_bridge.sql
-- =====================================================================
-- Phase 1 of the voice-first surface (askjo.ai-inspired).
--
-- Architecture:
--   - A Go bridge service (bridge/) holds long-lived WhatsApp Web
--     connections via the whatsmeow library. It runs on Fly.io.
--   - whatsmeow uses its own sqlstore tables (whatsmeow_device,
--     whatsmeow_session, etc) — those are created by the library on
--     first run, not by this migration. We share the same Postgres
--     database so the bridge can reload sessions after restart.
--   - This migration creates the mapping table that links a TwinMe
--     user_id ↔ a WhatsApp JID. Without this link, an inbound message
--     has no user context.
--
-- Security:
--   - RLS enabled, service_role only. Browser clients never touch this
--     table directly — they go through /api/voice/* which uses the
--     service-role supabase client.
--   - session_jid + display_name are not secrets (the JID is a phone
--     number derivative; display_name is what shows on WhatsApp).
--     The actual encryption keys live in whatsmeow_session, managed by
--     the library; the bridge keeps them in the same DB so a session
--     compromise == DB compromise, no extra surface.
-- =====================================================================

CREATE TABLE IF NOT EXISTS whatsapp_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jid             text NOT NULL,                              -- WhatsApp JID, e.g. 5511999999999@s.whatsapp.net
  display_name    text,                                       -- the name they show in WhatsApp
  phone_number    text,                                       -- e164, parsed from jid
  status          text NOT NULL DEFAULT 'pending'             -- pending | linked | error | unlinked
                  CHECK (status IN ('pending','linked','error','unlinked')),
  linked_at       timestamptz,
  last_seen_at    timestamptz,                                -- updated when bridge sees activity
  error_message   text,                                       -- if status='error', why
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One WhatsApp account links to at most one TwinMe user at a time.
-- The user can unlink and a different user can link the same JID later
-- (the old row will be status='unlinked').
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_links_active_jid
  ON whatsapp_links (jid)
  WHERE status = 'linked';

CREATE INDEX IF NOT EXISTS idx_whatsapp_links_user_id
  ON whatsapp_links (user_id, status);

ALTER TABLE whatsapp_links ENABLE ROW LEVEL SECURITY;

-- Service role only. Bridge uses service_role; the Express /api/voice/*
-- endpoints use supabaseAdmin which is also service_role.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'whatsapp_links'::regclass
      AND polname = 'Service role whatsapp_links'
  ) THEN
    CREATE POLICY "Service role whatsapp_links"
      ON whatsapp_links FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Voice message audit log — every voice message in/out for diagnostics
-- and so the web /talk-to-twin history can render WhatsApp turns.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  link_id           uuid REFERENCES whatsapp_links(id) ON DELETE SET NULL,
  direction         text NOT NULL CHECK (direction IN ('inbound','outbound')),
  whatsapp_message_id text,                                   -- WhatsApp's own message id
  message_type      text NOT NULL CHECK (message_type IN ('voice','text','image','document','unsupported')),
  transcript        text,                                     -- Whisper output for voice
  text_body         text,                                     -- raw text or twin reply body
  duration_seconds  numeric,                                  -- voice-only
  trace_id          text,                                     -- maps to mcp_conversation_logs.trace_id
  twin_conversation_id uuid REFERENCES twin_conversations(id) ON DELETE SET NULL,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user_id_created_at
  ON whatsapp_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_trace_id
  ON whatsapp_messages (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_link_id
  ON whatsapp_messages (link_id) WHERE link_id IS NOT NULL;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'whatsapp_messages'::regclass
      AND polname = 'Service role whatsapp_messages'
  ) THEN
    CREATE POLICY "Service role whatsapp_messages"
      ON whatsapp_messages FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE whatsapp_links IS
  'Maps TwinMe user_id to a WhatsApp JID. Bridge service (Go/whatsmeow) creates rows during QR-link flow.';
COMMENT ON TABLE whatsapp_messages IS
  'Audit log of voice + text exchanged via the WhatsApp bridge. Mirrors twin chat turns for /talk-to-twin history rendering.';
