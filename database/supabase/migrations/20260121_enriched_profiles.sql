-- ============================================================================
-- Enriched Profiles Migration
-- Stores profile data discovered from the web during onboarding.
-- Uses Perplexity Sonar API to find public information about users.
-- ============================================================================

-- Create enriched_profiles table
CREATE TABLE IF NOT EXISTS public.enriched_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,

  -- Discovered fields
  discovered_name TEXT,
  discovered_company TEXT,
  discovered_title TEXT,
  discovered_location TEXT,
  discovered_linkedin_url TEXT,
  discovered_twitter_url TEXT,
  discovered_github_url TEXT,
  discovered_bio TEXT,

  -- Raw data
  raw_search_response JSONB,
  search_query TEXT,

  -- Confirmation status
  user_confirmed BOOLEAN DEFAULT FALSE,
  confirmed_data JSONB,
  corrections JSONB,

  -- Metadata
  enriched_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  source TEXT DEFAULT 'perplexity_sonar',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_enriched_profiles_user ON public.enriched_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_enriched_profiles_email ON public.enriched_profiles(email);

-- Create unique constraint - one enriched profile per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_enriched_profiles_user_unique
  ON public.enriched_profiles(user_id)
  WHERE user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.enriched_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own enriched profile
CREATE POLICY "Users can view own enriched profile"
  ON public.enriched_profiles
  FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Users can insert their own enriched profile
CREATE POLICY "Users can insert own enriched profile"
  ON public.enriched_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users can update their own enriched profile
CREATE POLICY "Users can update own enriched profile"
  ON public.enriched_profiles
  FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Service role can do everything (for API routes)
CREATE POLICY "Service role has full access to enriched profiles"
  ON public.enriched_profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_enriched_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_enriched_profiles_updated_at
  BEFORE UPDATE ON public.enriched_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_enriched_profiles_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.enriched_profiles IS 'Stores web-discovered profile data from Perplexity Sonar API during enrichment-first onboarding. Allows users to confirm or correct discovered information.';
