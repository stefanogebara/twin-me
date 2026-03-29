-- Add Google Gaia ID enrichment columns to enriched_profiles
-- Source: Google People API (post-OAuth, fire-and-forget)

ALTER TABLE public.enriched_profiles
  ADD COLUMN IF NOT EXISTS google_gaia_id TEXT,
  ADD COLUMN IF NOT EXISTS google_maps_contributions JSONB,
  ADD COLUMN IF NOT EXISTS google_linked_youtube TEXT;

COMMENT ON COLUMN public.enriched_profiles.google_gaia_id IS 'Google Gaia ID extracted from People API metadata';
COMMENT ON COLUMN public.enriched_profiles.google_maps_contributions IS 'Maps review/photo counts from public contributor page';
COMMENT ON COLUMN public.enriched_profiles.google_linked_youtube IS 'Linked YouTube channel URL from Google profile';
