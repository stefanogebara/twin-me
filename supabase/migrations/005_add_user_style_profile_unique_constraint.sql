-- ============================================================================
-- Add UNIQUE constraint to user_style_profile.user_id
-- Migration: 005_add_user_style_profile_unique_constraint
-- Purpose: Fix ON CONFLICT error in stylometric analysis
-- ============================================================================

-- Each user should only have ONE style profile
-- This enables UPSERT operations: INSERT ... ON CONFLICT (user_id) DO UPDATE

ALTER TABLE user_style_profile
ADD CONSTRAINT user_style_profile_user_id_unique UNIQUE (user_id);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT user_style_profile_user_id_unique ON user_style_profile
IS 'Ensures each user has only one style profile. Enables UPSERT operations for style analysis updates.';
