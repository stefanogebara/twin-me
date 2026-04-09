-- Beta Applications table
-- Stores beta signup applications with platform preferences and motivation.
-- Separate from beta_waitlist (which is email-only) and beta_invite_codes (which is invite management).

CREATE TABLE IF NOT EXISTS public.beta_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'approved', -- approved | pending | rejected
  invite_code TEXT, -- the generated invite code returned to the user
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- linked after account creation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_beta_applications_email ON public.beta_applications(email);
CREATE INDEX IF NOT EXISTS idx_beta_applications_status ON public.beta_applications(status);

ALTER TABLE public.beta_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access beta_applications"
  ON public.beta_applications FOR ALL
  TO service_role USING (true) WITH CHECK (true);
