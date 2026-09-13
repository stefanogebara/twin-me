-- =============================================================================
-- Money: when a reading was first said (2026-09-13)
-- =============================================================================
-- A reading is recomputed on every pull and its computed_at moves with it, so the
-- ledger could not tell a line it has been saying for a month from one it said
-- this morning. first_seen_at is set once, on insert, and never moved: it is the
-- day the money first said this. From it the page can say how long the money has
-- had nothing new to say, which is a feature, not a fault.
-- =============================================================================
ALTER TABLE public.money_readings ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- Rows that already exist were first said no later than their last computation.
UPDATE public.money_readings SET first_seen_at = computed_at WHERE first_seen_at > computed_at;
