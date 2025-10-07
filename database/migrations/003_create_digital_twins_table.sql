-- Migration 003: Create Digital Twins Table
-- This table stores digital twin profiles for both personal and professor types

-- ====================================================================
-- DIGITAL TWINS TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS digital_twins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL, -- References user who created this twin
  user_id UUID, -- For backwards compatibility, may reference users table

  -- Basic twin information
  name TEXT NOT NULL,
  description TEXT,
  subject_area TEXT, -- For professor twins
  twin_type TEXT NOT NULL CHECK (twin_type IN ('professor', 'personal')),
  is_active BOOLEAN DEFAULT false,

  -- Personality and style (JSONB for flexibility)
  personality_traits JSONB DEFAULT '{}',
  teaching_style JSONB DEFAULT '{}',
  common_phrases JSONB DEFAULT '[]', -- Array of common phrases
  favorite_analogies JSONB DEFAULT '[]', -- Array of favorite analogies

  -- Knowledge base status
  knowledge_base_status TEXT DEFAULT 'empty' CHECK (knowledge_base_status IN (
    'empty', 'building', 'ready', 'updating', 'error'
  )),

  -- Soul signature data
  soul_signature JSONB DEFAULT '{}', -- Extracted soul signature patterns
  connected_platforms TEXT[] DEFAULT ARRAY[]::TEXT[], -- Which platforms are connected

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_digital_twins_creator ON digital_twins(creator_id);
CREATE INDEX IF NOT EXISTS idx_digital_twins_user ON digital_twins(user_id);
CREATE INDEX IF NOT EXISTS idx_digital_twins_type ON digital_twins(twin_type);
CREATE INDEX IF NOT EXISTS idx_digital_twins_active ON digital_twins(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_digital_twins_created ON digital_twins(created_at DESC);

-- ====================================================================
-- TRAINING MATERIALS TABLE (for digital twin knowledge base)
-- ====================================================================

CREATE TABLE IF NOT EXISTS training_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID NOT NULL REFERENCES digital_twins(id) ON DELETE CASCADE,

  -- Material metadata
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf', 'docx', 'txt', 'video', 'audio', etc.
  file_size BIGINT, -- Size in bytes
  file_url TEXT, -- Storage URL

  -- Processing status
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN (
    'pending', 'processing', 'completed', 'failed'
  )),
  processed_text TEXT, -- Extracted text content
  embedding_status TEXT DEFAULT 'pending',

  -- Metadata
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_training_materials_twin ON training_materials(twin_id);
CREATE INDEX IF NOT EXISTS idx_training_materials_status ON training_materials(processing_status);

-- ====================================================================
-- CHAT HISTORY TABLE (for twin interactions)
-- ====================================================================

CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID NOT NULL REFERENCES digital_twins(id) ON DELETE CASCADE,
  user_id UUID, -- User who chatted with the twin

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Metadata
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  session_id TEXT, -- Group messages by session

  -- Optional: Store AI model used for response
  model_used TEXT,
  tokens_used INTEGER
);

CREATE INDEX IF NOT EXISTS idx_chat_history_twin ON chat_history(twin_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_session ON chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

-- Enable RLS on all tables
ALTER TABLE digital_twins ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- Digital Twins Policies
-- Users can view their own twins or active professor twins
CREATE POLICY "Users can view own twins" ON digital_twins
  FOR SELECT USING (
    creator_id::text = auth.uid()::text OR
    (is_active = true AND twin_type = 'professor')
  );

CREATE POLICY "Users can create own twins" ON digital_twins
  FOR INSERT WITH CHECK (creator_id::text = auth.uid()::text);

CREATE POLICY "Users can update own twins" ON digital_twins
  FOR UPDATE USING (creator_id::text = auth.uid()::text);

CREATE POLICY "Users can delete own twins" ON digital_twins
  FOR DELETE USING (creator_id::text = auth.uid()::text);

-- Training Materials Policies
CREATE POLICY "Users can view materials for their twins" ON training_materials
  FOR SELECT USING (
    twin_id IN (
      SELECT id FROM digital_twins WHERE creator_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can add materials to their twins" ON training_materials
  FOR INSERT WITH CHECK (
    twin_id IN (
      SELECT id FROM digital_twins WHERE creator_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can update materials for their twins" ON training_materials
  FOR UPDATE USING (
    twin_id IN (
      SELECT id FROM digital_twins WHERE creator_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete materials from their twins" ON training_materials
  FOR DELETE USING (
    twin_id IN (
      SELECT id FROM digital_twins WHERE creator_id::text = auth.uid()::text
    )
  );

-- Chat History Policies
CREATE POLICY "Users can view their own chat history" ON chat_history
  FOR SELECT USING (
    user_id::text = auth.uid()::text OR
    twin_id IN (
      SELECT id FROM digital_twins WHERE creator_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can add to chat history" ON chat_history
  FOR INSERT WITH CHECK (true); -- Allow inserts from chat system

-- ====================================================================
-- TRIGGERS
-- ====================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_digital_twins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER digital_twins_updated_at
  BEFORE UPDATE ON digital_twins
  FOR EACH ROW
  EXECUTE FUNCTION update_digital_twins_updated_at();

-- ====================================================================
-- COMMENTS
-- ====================================================================

COMMENT ON TABLE digital_twins IS 'Digital twin profiles for personal soul signatures and professor twins';
COMMENT ON COLUMN digital_twins.creator_id IS 'User ID who created and owns this digital twin';
COMMENT ON COLUMN digital_twins.soul_signature IS 'Extracted personality patterns and characteristics';
COMMENT ON COLUMN digital_twins.connected_platforms IS 'Array of platform names connected to this twin';
COMMENT ON TABLE training_materials IS 'Knowledge base materials for training digital twins';
COMMENT ON TABLE chat_history IS 'Conversation history with digital twins';

-- ====================================================================
-- MIGRATION COMPLETE
-- ====================================================================

-- Verify tables were created
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('digital_twins', 'training_materials', 'chat_history')
ORDER BY table_name, ordinal_position;
