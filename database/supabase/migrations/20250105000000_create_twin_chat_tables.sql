-- Twin Chat System Database Schema
-- Created: 2025-01-05
-- Purpose: Support AI-powered digital twin chat with conversation history

-- ============================================================================
-- TWIN CONVERSATIONS TABLE
-- ============================================================================
-- Stores conversation threads between users and their digital twins
CREATE TABLE IF NOT EXISTS twin_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  mode TEXT NOT NULL CHECK (mode IN ('twin', 'tutor', 'analyst')),
  twin_type TEXT CHECK (twin_type IN ('personal', 'professional')),
  context TEXT CHECK (context IN ('casual', 'creative', 'social', 'work', 'meeting', 'networking')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient user queries
CREATE INDEX IF NOT EXISTS idx_twin_conversations_user_id ON twin_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_twin_conversations_mode ON twin_conversations(mode);
CREATE INDEX IF NOT EXISTS idx_twin_conversations_updated_at ON twin_conversations(updated_at DESC);

-- ============================================================================
-- TWIN MESSAGES TABLE
-- ============================================================================
-- Stores individual messages within conversations
CREATE TABLE IF NOT EXISTS twin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES twin_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient conversation queries
CREATE INDEX IF NOT EXISTS idx_twin_messages_conversation_id ON twin_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_twin_messages_created_at ON twin_messages(created_at);

-- ============================================================================
-- TWIN PERSONALITY PROFILES TABLE
-- ============================================================================
-- Caches generated personality profiles for efficient chat responses
CREATE TABLE IF NOT EXISTS twin_personality_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  profile_data JSONB NOT NULL,
  communication_style JSONB,
  interests JSONB,
  expertise JSONB,
  patterns JSONB,
  platforms_analyzed TEXT[],
  last_analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient user lookup
CREATE INDEX IF NOT EXISTS idx_twin_personality_profiles_user_id ON twin_personality_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_twin_personality_profiles_updated_at ON twin_personality_profiles(updated_at);

-- ============================================================================
-- TWIN CHAT USAGE TABLE
-- ============================================================================
-- Tracks token usage and costs for budget management
CREATE TABLE IF NOT EXISTS twin_chat_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES twin_conversations(id) ON DELETE SET NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  estimated_cost DECIMAL(10, 6) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient usage queries
CREATE INDEX IF NOT EXISTS idx_twin_chat_usage_user_id ON twin_chat_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_twin_chat_usage_created_at ON twin_chat_usage(created_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE twin_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE twin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE twin_personality_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE twin_chat_usage ENABLE ROW LEVEL SECURITY;

-- Conversations: Users can only access their own conversations
CREATE POLICY "Users can view their own conversations"
  ON twin_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
  ON twin_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON twin_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON twin_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- Messages: Users can only access messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
  ON twin_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM twin_conversations
      WHERE twin_conversations.id = twin_messages.conversation_id
      AND twin_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON twin_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM twin_conversations
      WHERE twin_conversations.id = twin_messages.conversation_id
      AND twin_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own messages"
  ON twin_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM twin_conversations
      WHERE twin_conversations.id = twin_messages.conversation_id
      AND twin_conversations.user_id = auth.uid()
    )
  );

-- Personality Profiles: Users can only access their own profile
CREATE POLICY "Users can view their own personality profile"
  ON twin_personality_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own personality profile"
  ON twin_personality_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own personality profile"
  ON twin_personality_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Chat Usage: Users can only view their own usage
CREATE POLICY "Users can view their own chat usage"
  ON twin_chat_usage FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for twin_conversations
DROP TRIGGER IF EXISTS update_twin_conversations_updated_at ON twin_conversations;
CREATE TRIGGER update_twin_conversations_updated_at
  BEFORE UPDATE ON twin_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for twin_personality_profiles
DROP TRIGGER IF EXISTS update_twin_personality_profiles_updated_at ON twin_personality_profiles;
CREATE TRIGGER update_twin_personality_profiles_updated_at
  BEFORE UPDATE ON twin_personality_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-update conversation updated_at when new message is added
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE twin_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update conversation timestamp
DROP TRIGGER IF EXISTS update_conversation_on_new_message ON twin_messages;
CREATE TRIGGER update_conversation_on_new_message
  AFTER INSERT ON twin_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON twin_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON twin_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON twin_personality_profiles TO authenticated;
GRANT SELECT ON twin_chat_usage TO authenticated;

-- Grant sequence usage
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
