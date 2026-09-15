-- =============================================================================
-- Money: a person's word on a place is theirs, not everyone's (2026-09-15)
-- =============================================================================
-- money_places is one row per merchant for every user, and category_override sat on
-- it: a kind one person set for a shop applied to everyone who paid the same shop.
-- Harmless with one user, a bug with two. The person's word moves here, keyed by
-- user and merchant; the shared row keeps only what a provider said.
-- Code: categoriesFor / setPlaceCategory in api/services/money/store.js.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.money_place_overrides (
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  merchant_key  TEXT NOT NULL,
  category      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, merchant_key)
);
ALTER TABLE public.money_place_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS money_place_overrides_select_own ON public.money_place_overrides;
CREATE POLICY money_place_overrides_select_own ON public.money_place_overrides FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS money_place_overrides_service_all ON public.money_place_overrides;
CREATE POLICY money_place_overrides_service_all ON public.money_place_overrides FOR ALL TO service_role USING (true) WITH CHECK (true);
-- The words already given belong to the one person who gave them (the only user with a bank on 2026-09-15).
INSERT INTO public.money_place_overrides (user_id, merchant_key, category)
SELECT '167c27b5-a40b-49fb-8d00-deb1b1c57f4d', merchant_key, category_override FROM public.money_places WHERE category_override IS NOT NULL
ON CONFLICT (user_id, merchant_key) DO NOTHING;
