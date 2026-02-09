-- User Memories Table
-- Stores conversation memories, extracted facts, and platform data
-- Used by the mem0-style memory service for long-term context

CREATE TABLE IF NOT EXISTS user_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type VARCHAR(50) NOT NULL, -- 'conversation', 'fact', 'platform_data'
  content TEXT NOT NULL,
  response TEXT, -- For conversation type, stores assistant response
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_type ON user_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_user_memories_created ON user_memories(created_at DESC);

-- Full text search index for content (optional but useful for search)
CREATE INDEX IF NOT EXISTS idx_user_memories_content_gin ON user_memories USING gin(to_tsvector('english', content));

-- Enable RLS
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own memories
CREATE POLICY "Users can view own memories"
  ON user_memories FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own memories
CREATE POLICY "Users can insert own memories"
  ON user_memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own memories
CREATE POLICY "Users can delete own memories"
  ON user_memories FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Service role can manage all memories (for backend)
CREATE POLICY "Service role full access"
  ON user_memories FOR ALL
  USING (auth.role() = 'service_role');

-- Comment for documentation
COMMENT ON TABLE user_memories IS 'Long-term memory storage for TwinMe conversations and extracted facts';
COMMENT ON COLUMN user_memories.memory_type IS 'Type of memory: conversation, fact, or platform_data';
COMMENT ON COLUMN user_memories.content IS 'The main content of the memory (user message, fact, or platform data)';
COMMENT ON COLUMN user_memories.response IS 'For conversations, the assistant response';
COMMENT ON COLUMN user_memories.metadata IS 'Additional metadata like source, platform, category, etc.';
