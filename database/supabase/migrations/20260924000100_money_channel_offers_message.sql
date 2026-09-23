-- The offers of one WhatsApp reply remember the message they rode in, so a reaction on that
-- message (a thumbs-up) can find its first offer and take it, the way a tap does (2026-09-24).
ALTER TABLE public.money_channel_offers ADD COLUMN IF NOT EXISTS message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_money_channel_offers_message ON public.money_channel_offers (user_id, message_id) WHERE message_id IS NOT NULL;
