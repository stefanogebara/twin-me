-- =============================================================================
-- Money: a judged category belongs to the person it was judged for (2026-09-22)
-- =============================================================================
-- On 2026-09-15 the person's own word moved off the shared money_places row,
-- because "a kind one person set for a shop applied to everyone who paid the
-- same shop" — harmless with one user, a bug with two. The shared row was left
-- holding only what a provider said.
--
-- judge.js (D15) walked straight back into that: when the provider and the brand
-- table both had nothing, it wrote its answer onto the shared row. Worse than a
-- person's correction, because the question it answers carries that person's own
-- payment count and typical amount — an inference from one ledger's private
-- behaviour, written where every ledger reads it. And the merchants it is asked
-- about are exactly the ambiguous ones: "Empresa Municip", "Ciudad De La Ra",
-- "Mqttmdb1", truncated bank strings that need not mean the same thing on two
-- different statements.
--
-- So a judged category lands here instead, per person, beside the person's own
-- word but never disguised as it: `source` says who said so, and a person's
-- correction overwrites the row and takes the source back.
-- Code: enrichPlaces / setPlaceCategory in api/services/money/store.js.
-- =============================================================================
ALTER TABLE public.money_place_overrides
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS confidence REAL;

COMMENT ON COLUMN public.money_place_overrides.source IS
  'person = they said so; jev = a judge filled a hole no provider could (judge.js). Everything judged can be found and undone with source = ''jev''.';
COMMENT ON COLUMN public.money_place_overrides.confidence IS
  'For a judged row, the probability the judge gave its own answer. Null when a person said it.';
