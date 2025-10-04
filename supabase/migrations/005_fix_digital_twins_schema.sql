-- ============================================================================
-- FIX DIGITAL TWINS SCHEMA - Missing Columns
-- Migration: 005_fix_digital_twins_schema
-- Purpose: Add missing columns that code expects but are not in database
-- ============================================================================

-- The code in api/routes/twins.js expects these columns to exist in digital_twins table
-- but they're missing from the current schema. This migration adds them.

-- Add teaching_philosophy column (expected by conversational twin builder)
ALTER TABLE digital_twins
ADD COLUMN IF NOT EXISTS teaching_philosophy TEXT;

-- Add student_interaction column (expected by conversational twin builder)
ALTER TABLE digital_twins
ADD COLUMN IF NOT EXISTS student_interaction TEXT;

-- Add humor_style column (expected by conversational twin builder)
ALTER TABLE digital_twins
ADD COLUMN IF NOT EXISTS humor_style TEXT;

-- Add communication_style column (expected by conversational twin builder)
ALTER TABLE digital_twins
ADD COLUMN IF NOT EXISTS communication_style TEXT;

-- Add expertise column (expected by conversational twin builder)
-- Note: This is different from expertise_areas in profiles table
ALTER TABLE digital_twins
ADD COLUMN IF NOT EXISTS expertise TEXT[];

-- Add voice_id column (for ElevenLabs voice integration)
ALTER TABLE digital_twins
ADD COLUMN IF NOT EXISTS voice_id TEXT;

-- Add metadata column for flexible data storage
ALTER TABLE digital_twins
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_digital_twins_voice_id ON digital_twins(voice_id);
CREATE INDEX IF NOT EXISTS idx_digital_twins_twin_type ON digital_twins(twin_type);
CREATE INDEX IF NOT EXISTS idx_digital_twins_is_active ON digital_twins(is_active);

-- Add comments for documentation
COMMENT ON COLUMN digital_twins.teaching_philosophy IS 'Professor teaching philosophy and approach (from conversational builder)';
COMMENT ON COLUMN digital_twins.student_interaction IS 'How professor interacts with students (from conversational builder)';
COMMENT ON COLUMN digital_twins.humor_style IS 'Professor humor and personality style (from conversational builder)';
COMMENT ON COLUMN digital_twins.communication_style IS 'Professor communication preferences (from conversational builder)';
COMMENT ON COLUMN digital_twins.expertise IS 'Areas of expertise as text array';
COMMENT ON COLUMN digital_twins.voice_id IS 'ElevenLabs voice ID for text-to-speech';
COMMENT ON COLUMN digital_twins.metadata IS 'Additional metadata for flexible storage';

-- Update updated_at timestamp when changes occur
CREATE OR REPLACE FUNCTION update_digital_twins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Ensure trigger exists (may already exist from initial migration)
DROP TRIGGER IF EXISTS update_digital_twins_updated_at ON digital_twins;
CREATE TRIGGER update_digital_twins_updated_at
BEFORE UPDATE ON digital_twins
FOR EACH ROW EXECUTE FUNCTION update_digital_twins_updated_at();

-- Migration complete
-- All columns expected by api/routes/twins.js are now present
