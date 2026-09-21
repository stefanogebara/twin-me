-- The money twin on a messaging channel (2026-09-22).
-- Service role only: row level security on, no policies, nothing for anon or authenticated.

CREATE TABLE IF NOT EXISTS public.money_channel_inbound (
  message_id   TEXT PRIMARY KEY,               -- the provider's id; a second delivery is a no-op
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.money_channel_offers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  position    SMALLINT NOT NULL DEFAULT 0,     -- the order the offers of one reply were shown in
  action      JSONB NOT NULL,                  -- the offer as chat.js validated it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  taken_at    TIMESTAMPTZ,
  said        TEXT                             -- what act() answered
);
CREATE INDEX IF NOT EXISTS idx_money_channel_offers_user_time ON public.money_channel_offers (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.money_facts_retired (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fact        JSONB NOT NULL,                  -- the whole row as it stood
  retired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_money_facts_retired_user ON public.money_facts_retired (user_id, retired_at DESC);

ALTER TABLE public.money_channel_inbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_channel_offers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_facts_retired   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.money_channel_inbound, public.money_channel_offers, public.money_facts_retired FROM anon, authenticated;
