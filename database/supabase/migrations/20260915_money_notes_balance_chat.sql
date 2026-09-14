-- =============================================================================
-- Money: a person's own words on a fact, the account's balance, the conversation (2026-09-15)
-- =============================================================================
-- Three small things the day asked for.
--  1. money_facts.note: when a choice is "other", the person can say what the thing is
--     ("my landlord", "the ski trip deposit"); kept beside the fact, read by the twin.
--  2. money_accounts.balance: the bank's own figure for what is in the account, read on
--     attended pulls (the person present, outside the four-a-day budget), with its type
--     and the moment it was read. The real thing under safe to spend.
--  3. money_chat_turns: the conversation with the ledger, kept so it can be picked up
--     again and so a correction made in words is remembered.
-- Code: store.js (answerQuestion, saveBankBalances), chat.js (turns).
-- =============================================================================
ALTER TABLE public.money_facts ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE public.money_accounts ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2);
ALTER TABLE public.money_accounts ADD COLUMN IF NOT EXISTS balance_type TEXT;
ALTER TABLE public.money_accounts ADD COLUMN IF NOT EXISTS balance_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.money_chat_turns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,                -- user | twin
  text         TEXT NOT NULL,
  figures      JSONB,                        -- the figures drawn under a twin turn
  actions      JSONB,                        -- the offers made, and whether one was taken
  thinking     TEXT,                         -- the model's own reasoning, when the model gives it
  basis        JSONB,                        -- the context lines the answer stood on
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_money_chat_turns_user_time ON public.money_chat_turns (user_id, created_at DESC);
ALTER TABLE public.money_chat_turns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS money_chat_turns_select_own ON public.money_chat_turns;
CREATE POLICY money_chat_turns_select_own ON public.money_chat_turns FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS money_chat_turns_service_all ON public.money_chat_turns;
CREATE POLICY money_chat_turns_service_all ON public.money_chat_turns FOR ALL TO service_role USING (true) WITH CHECK (true);
