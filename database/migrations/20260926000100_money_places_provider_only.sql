-- =============================================================================
-- Money: the shared place cache holds only what a provider said (2026-09-26, audit S5)
-- =============================================================================
-- money_places is one row per merchant key for every ledger. Until today a person's own text
-- was written into it and read back by anyone who shared the key: the category route named a
-- row after whatever the caller sent (provider 'person') and read the row's name back to any
-- caller; the lookup named every row after the first ledger's own bank line, a Bizum's payee
-- included, and kept its misses there; and every reader preferred that name to the person's
-- own, down to another person's Ask prompt. A key is the first three words of a name, so a
-- person's key ("juan perez garcia") is guessable.
--
-- The code (api/_app/services/money/store.js: sharedPlace, enrichPlaces, setPlaceCategory,
-- listPlaces, categorySpend):
--   * writes a shared row only when a place provider, or the brand table, placed the merchant,
--     named with the provider's own label or else the key, and never renames one;
--   * keeps a merchant nothing could place, and anyone paid by transfer or Bizum, with the
--     person alone: a row here in money_place_overrides with no category (source 'unplaced'),
--     so the next run does not ask about it again;
--   * shows every person the name on their own payments: no reader takes a name from here.
--
-- APPLY BEFORE DEPLOYING THE CODE. Step 1 is what lets that per-person record exist; without
-- it the insert fails and every run asks again about the same merchants, the judge included.
-- Steps 2 to 6 clean what the old code wrote and are idempotent: run the file once more after
-- the deploy to catch rows the old code wrote in between.
-- =============================================================================

-- 1. A person's own record of a merchant may say that nothing placed it: no category.
ALTER TABLE public.money_place_overrides ALTER COLUMN category DROP NOT NULL;
COMMENT ON COLUMN public.money_place_overrides.source IS
  'person = they said so; jev = a judge filled a hole no provider could (judge.js); unplaced = looked at for them and nothing placed it (no category; their own word replaces it). Everything judged can be found and undone with source = ''jev''.';

-- 2. Before the shared misses go, everyone holding one keeps it as their own record, so
--    nothing already asked is asked again. A name somebody sent (provider 'person') is not a
--    miss: its author has their word here already, and for everyone else it only stopped a
--    lookup.
INSERT INTO public.money_place_overrides (user_id, merchant_key, category, source, confidence)
SELECT DISTINCT t.user_id, p.merchant_key, NULL::text, 'unplaced', NULL::real
FROM public.money_places p
JOIN public.money_transactions t ON t.merchant_key = p.merchant_key AND t.amount < 0
WHERE p.provider IS DISTINCT FROM 'person' AND p.category IS NULL AND p.lat IS NULL
ON CONFLICT (user_id, merchant_key) DO NOTHING;

-- 3. Rows holding nothing a provider said: a name somebody sent, a miss, a guess under half
--    confidence (the old code kept neither its kind nor its point).
DELETE FROM public.money_places WHERE provider = 'person' OR (category IS NULL AND lat IS NULL);

-- 4. Rows about people, and rows nobody holds: a key no ledger has paid except by transfer or
--    Bizum, or no longer has at all. No provider is asked about a person any more; what one
--    said ("Ruiz M." became a hotel, 2026-09-23) was never about the person paid.
DELETE FROM public.money_places p
WHERE NOT EXISTS (
  SELECT 1 FROM public.money_transactions t
  WHERE t.merchant_key = p.merchant_key AND COALESCE(t.channel, '') NOT IN ('transfer', 'bizum')
);

-- 5. The name is the provider's own label, else the key: never the first ledger's bank line.
--    Only a row with a provider's point has a provider's label worth keeping.
UPDATE public.money_places
SET name = CASE
    WHEN lat IS NOT NULL
     AND jsonb_typeof(raw -> 'body') = 'object'
     AND NULLIF(btrim(raw ->> 'provider_name'), '') IS NOT NULL
      THEN btrim(raw ->> 'provider_name')
    ELSE merchant_key
  END
WHERE name IS DISTINCT FROM merchant_key;

-- 6. A row with no provider point carries nothing of the provider's but its kind: the city and
--    the country came off the first ledger's own line and profile, and an online row's raw
--    held that line as its "provider name".
UPDATE public.money_places
SET city = NULL, country = NULL, provider_place_id = NULL, raw = NULL
WHERE lat IS NULL
  AND (city IS NOT NULL OR country IS NOT NULL OR provider_place_id IS NOT NULL OR raw IS NOT NULL);
