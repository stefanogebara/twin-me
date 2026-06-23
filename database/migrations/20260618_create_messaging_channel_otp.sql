-- One-time codes that verify OWNERSHIP of a messaging channel_id (e.g. a
-- WhatsApp phone number) before it is linked into messaging_channels.
--
-- Closes the M1 gap: today POST /api/whatsapp-link/link trusts any phone the
-- caller submits, so a user could link a number they do not control. The flow
-- becomes: request -> we store a HASH of a short code + send the code to the
-- phone via WhatsApp -> caller submits the code -> on match we upsert
-- messaging_channels.
--
-- Security model mirrors magic_link_tokens: only a hash of the code is stored
-- (never plaintext), codes expire, attempts are capped to blunt brute force,
-- and RLS denies every client role -- only the service role (the API layer)
-- may read or write.
CREATE TABLE IF NOT EXISTS messaging_channel_otp (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL DEFAULT 'whatsapp',     -- matches messaging_channels.channel
  channel_id  TEXT NOT NULL,                        -- E.164 phone being verified
  code_hash   TEXT NOT NULL,                        -- HMAC-SHA256 of the code; never store plaintext
  attempts    INT NOT NULL DEFAULT 0,               -- verification tries; reject past the cap
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,                           -- set once the code is successfully used
  ip_address  TEXT                                   -- requester IP for audit / abuse throttling
);

-- Verification looks up the active code by (user, channel, channel_id).
CREATE INDEX IF NOT EXISTS idx_messaging_channel_otp_lookup
  ON messaging_channel_otp (user_id, channel, channel_id);

-- Supports periodic cleanup of expired / consumed codes.
CREATE INDEX IF NOT EXISTS idx_messaging_channel_otp_expires
  ON messaging_channel_otp (expires_at);

-- Sensitive (one-time codes): deny all client roles; service role only.
ALTER TABLE messaging_channel_otp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_anon_messaging_channel_otp ON messaging_channel_otp;
CREATE POLICY deny_all_anon_messaging_channel_otp
  ON messaging_channel_otp FOR ALL TO anon USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS deny_all_authenticated_messaging_channel_otp ON messaging_channel_otp;
CREATE POLICY deny_all_authenticated_messaging_channel_otp
  ON messaging_channel_otp FOR ALL TO authenticated USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS service_role_full_access ON messaging_channel_otp;
CREATE POLICY service_role_full_access ON messaging_channel_otp
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
