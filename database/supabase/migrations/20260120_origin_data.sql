-- ============================================================================
-- Origin Data Migration
-- Stores "hands-on" data that users provide manually - context that platforms
-- can't reveal, forming the Origin Universe component of the Soul Signature.
-- ============================================================================

-- Create origin_data table
CREATE TABLE IF NOT EXISTS public.origin_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Geographic Origin
  birthplace_city TEXT,
  birthplace_country TEXT,
  cultural_background TEXT[], -- Array of cultural influences
  languages_spoken TEXT[], -- Languages with proficiency levels
  current_city TEXT,
  current_country TEXT,
  places_lived TEXT[], -- Array of cities/countries lived in

  -- Education Background
  highest_education TEXT CHECK (highest_education IN (
    'high_school', 'some_college', 'associates', 'bachelors',
    'masters', 'doctorate', 'professional', 'other'
  )),
  field_of_study TEXT,
  institutions TEXT[], -- Array of educational institutions
  learning_style TEXT CHECK (learning_style IN (
    'visual', 'auditory', 'reading_writing', 'kinesthetic', 'mixed'
  )),

  -- Career Stage
  career_stage TEXT CHECK (career_stage IN (
    'student', 'early_career', 'mid_career', 'senior',
    'executive', 'entrepreneur', 'transitioning', 'retired'
  )),
  industry TEXT,
  years_experience INTEGER,
  career_goals TEXT,
  work_style TEXT CHECK (work_style IN (
    'remote', 'hybrid', 'office', 'field', 'flexible'
  )),

  -- Core Values (user-selected, max 5)
  core_values TEXT[], -- e.g., ['integrity', 'creativity', 'family', 'growth', 'freedom']

  -- Life Priorities (ranked 1-5)
  life_priorities JSONB, -- { "career": 1, "family": 2, "health": 3, "learning": 4, "adventure": 5 }

  -- Personal Context (optional freeform)
  defining_experiences TEXT,
  life_motto TEXT,

  -- Metadata
  completion_percentage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_origin_data_user_id ON public.origin_data(user_id);

-- Create unique constraint - one origin data per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_origin_data_user_unique ON public.origin_data(user_id);

-- Enable RLS
ALTER TABLE public.origin_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own origin data
CREATE POLICY "Users can view own origin data"
  ON public.origin_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own origin data
CREATE POLICY "Users can insert own origin data"
  ON public.origin_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own origin data
CREATE POLICY "Users can update own origin data"
  ON public.origin_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own origin data
CREATE POLICY "Users can delete own origin data"
  ON public.origin_data
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can do everything (for API routes)
CREATE POLICY "Service role has full access to origin data"
  ON public.origin_data
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_origin_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_origin_data_updated_at
  BEFORE UPDATE ON public.origin_data
  FOR EACH ROW
  EXECUTE FUNCTION update_origin_data_updated_at();

-- Create function to calculate completion percentage
CREATE OR REPLACE FUNCTION calculate_origin_completion(origin_row public.origin_data)
RETURNS INTEGER AS $$
DECLARE
  total_fields INTEGER := 15;
  filled_fields INTEGER := 0;
BEGIN
  -- Geographic (4 fields)
  IF origin_row.birthplace_country IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.current_country IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.cultural_background IS NOT NULL AND array_length(origin_row.cultural_background, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.languages_spoken IS NOT NULL AND array_length(origin_row.languages_spoken, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;

  -- Education (3 fields)
  IF origin_row.highest_education IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.field_of_study IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.learning_style IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  -- Career (4 fields)
  IF origin_row.career_stage IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.industry IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.years_experience IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.work_style IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  -- Values (2 fields)
  IF origin_row.core_values IS NOT NULL AND array_length(origin_row.core_values, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.life_priorities IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  -- Personal (2 fields)
  IF origin_row.defining_experiences IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF origin_row.life_motto IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  RETURN ROUND((filled_fields::DECIMAL / total_fields) * 100);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update completion percentage
CREATE OR REPLACE FUNCTION update_origin_completion()
RETURNS TRIGGER AS $$
BEGIN
  NEW.completion_percentage := calculate_origin_completion(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_origin_completion
  BEFORE INSERT OR UPDATE ON public.origin_data
  FOR EACH ROW
  EXECUTE FUNCTION update_origin_completion();

-- Add comment for documentation
COMMENT ON TABLE public.origin_data IS 'Stores hands-on user-provided origin data for Soul Signature - geographic, education, career, and values context that platforms cannot reveal.';
