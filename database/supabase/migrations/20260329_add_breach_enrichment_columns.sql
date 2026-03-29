-- Add email reputation and breach enrichment columns to enriched_profiles
-- Source: emailrep.io + HaveIBeenPwned API
-- These store breach metadata (service names only), not leaked data

ALTER TABLE public.enriched_profiles
  ADD COLUMN IF NOT EXISTS email_reputation TEXT,
  ADD COLUMN IF NOT EXISTS email_age_days INTEGER,
  ADD COLUMN IF NOT EXISTS breach_services JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS breach_mapped_integrations JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS digital_footprint_score INTEGER DEFAULT 0;

COMMENT ON COLUMN public.enriched_profiles.email_reputation IS 'Email reputation from emailrep.io: high/medium/low/none';
COMMENT ON COLUMN public.enriched_profiles.email_age_days IS 'Domain age in days from emailrep.io';
COMMENT ON COLUMN public.enriched_profiles.breach_services IS 'Services where email appeared in breaches (HIBP metadata, not leaked data)';
COMMENT ON COLUMN public.enriched_profiles.breach_mapped_integrations IS 'Breach services mapped to TwinMe integration slugs';
COMMENT ON COLUMN public.enriched_profiles.digital_footprint_score IS 'Count of unique online services associated with this email';
