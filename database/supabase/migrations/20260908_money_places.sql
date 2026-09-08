-- Money Twin v2, third migration: what kind of place a payment was, and where.
--
-- A ledger row says "Oakberry Acai" and the bank's own city, "MADRID ES". That is enough
-- to ask a places provider what kind of place it is, once per merchant, and to read a
-- month by kind of place afterwards. The answer is cached here because it does not change
-- and because a lookup costs money and a third party sees the query: one row per merchant
-- key, looked up once, reused by every transaction that shares the key.
--
-- What is sent to the provider is the merchant name, the city and the country. Never an
-- amount, never a card, never a user. The `provider` column records who was asked, so a
-- person can see it and a future migration can re-resolve a provider's answers.
--
-- `kind` is the provider's own word (supermarket, cafe, train_station, online).
-- `category` is our fixed vocabulary, the one the UI groups by (see api/services/money/places.js).

CREATE TABLE IF NOT EXISTS public.money_places (
  merchant_key          TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  kind                  TEXT,
  category              TEXT,
  lat                   DOUBLE PRECISION,
  lon                   DOUBLE PRECISION,
  city                  TEXT,
  country               TEXT,
  provider              TEXT,                          -- google | nominatim | local
  provider_place_id     TEXT,
  confidence            NUMERIC(3,2),
  raw                   JSONB,
  looked_up_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A person may correct a category; a correction outlives the next lookup.
  category_override     TEXT,
  overridden_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_money_places_category ON public.money_places (category);

-- Places are not personal data on their own (a supermarket in Madrid is a supermarket in
-- Madrid), and the table is shared across users by merchant key, so it carries no user_id
-- and no policy. Only the service role writes it.

-- The city the bank printed, kept on the transaction so a lookup has somewhere to start
-- and so a row can be read without a place.
ALTER TABLE public.money_transactions ADD COLUMN IF NOT EXISTS merchant_city TEXT;
