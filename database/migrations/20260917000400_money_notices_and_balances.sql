ALTER TABLE public.money_accounts ADD COLUMN IF NOT EXISTS balance_observed_at timestamptz;
-- balance_at now means the provider's timestamp. Old rows lack observed_at and are
-- deliberately ineligible for advice until a fresh provider read supplies both.
CREATE TABLE IF NOT EXISTS public.money_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_ref text NOT NULL,
  kind text NOT NULL,
  merchant text,
  amount numeric(12,2),
  currency text NOT NULL DEFAULT 'EUR',
  due_at timestamptz,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,source_ref)
);
ALTER TABLE public.money_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.money_notices FROM anon,authenticated;
GRANT ALL ON public.money_notices TO service_role;
CREATE POLICY money_notices_service_all ON public.money_notices FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE INDEX IF NOT EXISTS idx_money_notices_owner ON public.money_notices(user_id,created_at DESC);
