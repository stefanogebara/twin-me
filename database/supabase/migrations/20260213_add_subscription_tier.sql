-- Add subscription tier and monthly chat tracking to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS monthly_chat_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_chat_reset_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW());

-- Add check constraint separately (IF NOT EXISTS not supported for constraints)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_subscription_tier_check'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_subscription_tier_check
      CHECK (subscription_tier IN ('free', 'pro'));
  END IF;
END $$;

-- Index for efficient quota lookups
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON public.users(subscription_tier);
