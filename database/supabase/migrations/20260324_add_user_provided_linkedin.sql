-- Add user-provided LinkedIn URL to enriched_profiles
-- Distinct from discovered_linkedin_url (what Brave found) — this is what the user told us.
-- Used as a high-confidence anchor for search disambiguation.
ALTER TABLE enriched_profiles ADD COLUMN IF NOT EXISTS user_provided_linkedin_url TEXT;
