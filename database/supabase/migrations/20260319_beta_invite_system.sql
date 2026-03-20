-- Beta Invite System
-- Gates signups behind invite codes for controlled beta rollout (5-10 users)

-- 1. Beta invite codes
CREATE TABLE IF NOT EXISTS public.beta_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  created_for_email TEXT,
  created_for_name TEXT,
  used_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_beta_invite_code ON public.beta_invite_codes(code);
CREATE INDEX idx_beta_invite_used_by ON public.beta_invite_codes(used_by_user_id);

ALTER TABLE public.beta_invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access beta_invite_codes"
  ON public.beta_invite_codes FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 2. Beta waitlist
CREATE TABLE IF NOT EXISTS public.beta_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'waitlist_page',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.beta_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access beta_waitlist"
  ON public.beta_waitlist FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 3. Beta feedback
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  page_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_beta_feedback_user ON public.beta_feedback(user_id, created_at DESC);

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own feedback"
  ON public.beta_feedback FOR INSERT
  WITH CHECK ((SELECT auth.uid())::text = user_id::text);

CREATE POLICY "Users view own feedback"
  ON public.beta_feedback FOR SELECT
  USING ((SELECT auth.uid())::text = user_id::text);

CREATE POLICY "Service role full access beta_feedback"
  ON public.beta_feedback FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 4. Track which invite code was used on users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invite_code_id UUID REFERENCES public.beta_invite_codes(id);
