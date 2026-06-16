-- Reminders / scheduled nudges (2026-06-16): the twin stores time-based
-- reminders ("me lembra de pagar o boleto dia 10", "me cutuca amanhã 9h") and
-- delivers them on the user's channels at the time, piggybacked on the existing
-- */15 deliver-insights cron (no new cron invocations — Vercel cost rule).
CREATE TABLE IF NOT EXISTS reminders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  remind_at    TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | delivered | failed | cancelled
  attempts     INT NOT NULL DEFAULT 0,
  source       TEXT,                             -- 'whatsapp' | 'web' | 'telegram'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Hot path: the cron scans for due, still-pending reminders every 15 minutes.
CREATE INDEX IF NOT EXISTS idx_reminders_due
  ON reminders (remind_at)
  WHERE status = 'pending';
