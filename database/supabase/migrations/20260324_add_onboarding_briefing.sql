-- ============================================================================
-- Add onboarding_briefing JSONB column to enriched_profiles
-- Stores the LLM-generated first-impression briefing for onboarding.
-- Structure: { headline, observations[], gaps[], cta }
-- ============================================================================

ALTER TABLE public.enriched_profiles
  ADD COLUMN IF NOT EXISTS onboarding_briefing JSONB DEFAULT NULL;

COMMENT ON COLUMN public.enriched_profiles.onboarding_briefing
  IS 'LLM-generated first-impression briefing shown during onboarding. Structure: { headline: string, observations: string[], gaps: string[], cta: string }';
