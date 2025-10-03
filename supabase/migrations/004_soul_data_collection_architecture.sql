-- ============================================================================
-- TWINME SOUL DATA COLLECTION & LLM INTEGRATION ARCHITECTURE
-- Migration: 004_soul_data_collection_architecture
-- Purpose: Complete data recording system for OAuth platform data + RAG/LLM
-- ============================================================================

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- CORE DATA STORAGE TABLES
-- ============================================================================

-- 1. USER RAW DATA COLLECTION
-- Stores all raw data extracted from OAuth platforms
CREATE TABLE IF NOT EXISTS user_platform_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- github, discord, linkedin, spotify, slack
  data_type TEXT NOT NULL, -- message, post, commit, issue, comment, code, etc.
  raw_data JSONB NOT NULL, -- Complete raw API response
  extracted_at TIMESTAMP DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,

  -- Metadata
  metadata JSONB DEFAULT '{}', -- platform-specific metadata
  source_url TEXT, -- URL to original content
  created_at TIMESTAMP DEFAULT NOW(),

  -- Indexing for fast queries
  CONSTRAINT user_platform_data_unique UNIQUE (user_id, platform, data_type, source_url)
);

CREATE INDEX idx_user_platform_data_user ON user_platform_data(user_id);
CREATE INDEX idx_user_platform_data_platform ON user_platform_data(platform);
CREATE INDEX idx_user_platform_data_processed ON user_platform_data(processed);
CREATE INDEX idx_user_platform_data_extracted ON user_platform_data(extracted_at DESC);

-- 2. PROCESSED TEXT CONTENT
-- Stores cleaned, normalized text extracted from platform data
CREATE TABLE IF NOT EXISTS user_text_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_data_id UUID REFERENCES user_platform_data(id) ON DELETE CASCADE,

  -- Content
  text_content TEXT NOT NULL, -- Cleaned, normalized text
  content_type TEXT NOT NULL, -- message, post, code, comment, description, etc.
  language TEXT, -- Detected language (en, es, fr, etc.)
  word_count INTEGER,
  char_count INTEGER,

  -- Context
  platform TEXT NOT NULL,
  timestamp TIMESTAMP, -- When content was originally created
  context JSONB, -- Surrounding context (thread, channel, repo, etc.)

  -- Processing metadata
  processed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_text_content_user ON user_text_content(user_id);
CREATE INDEX idx_user_text_content_platform ON user_text_content(platform);
CREATE INDEX idx_user_text_content_timestamp ON user_text_content(timestamp DESC);
CREATE INDEX idx_user_text_content_type ON user_text_content(content_type);

-- 3. VECTOR EMBEDDINGS
-- Stores vector embeddings for RAG (Retrieval-Augmented Generation)
CREATE TABLE IF NOT EXISTS user_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text_content_id UUID REFERENCES user_text_content(id) ON DELETE CASCADE,

  -- Vector embedding (1536 dimensions for OpenAI, 768 for others)
  embedding vector(1536),

  -- Chunk information (for long texts split into chunks)
  chunk_text TEXT NOT NULL, -- The actual text chunk this embedding represents
  chunk_index INTEGER DEFAULT 0, -- Position in original text
  chunk_size INTEGER, -- Size of this chunk

  -- Metadata for filtering
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  timestamp TIMESTAMP,
  tags TEXT[], -- Custom tags for categorization

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_embeddings_user ON user_embeddings(user_id);
CREATE INDEX idx_user_embeddings_platform ON user_embeddings(platform);
CREATE INDEX idx_user_embeddings_content_type ON user_embeddings(content_type);

-- Create vector similarity search index (HNSW algorithm for fast approximate search)
CREATE INDEX ON user_embeddings USING hnsw (embedding vector_cosine_ops);

-- 4. STYLOMETRIC ANALYSIS
-- Stores extracted writing style features and personality traits
CREATE TABLE IF NOT EXISTS user_style_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Lexical Features (word choices, vocabulary)
  avg_word_length FLOAT,
  vocabulary_richness FLOAT, -- Type-token ratio
  unique_words_count INTEGER,
  total_words_count INTEGER,
  common_words JSONB, -- Top 50 most used words
  rare_words JSONB, -- Unique/rare words used

  -- Syntactic Features (sentence structure)
  avg_sentence_length FLOAT,
  sentence_complexity FLOAT,
  punctuation_patterns JSONB,
  grammar_patterns JSONB,

  -- Structural Features (organization)
  avg_paragraph_length FLOAT,
  text_organization_style TEXT, -- formal, casual, technical, creative
  formatting_preferences JSONB, -- emoji usage, capitalization, etc.

  -- Content-Specific Features
  topics JSONB, -- Main topics/themes
  interests TEXT[], -- Extracted interests
  expertise_areas TEXT[], -- Detected expertise

  -- Personality Indicators (Big Five, MBTI, etc.)
  personality_traits JSONB,
  communication_style TEXT, -- direct, diplomatic, casual, formal, etc.
  humor_style TEXT, -- sarcastic, witty, puns, dry, etc.
  emotional_tone JSONB, -- positive, negative, neutral percentages

  -- Behavioral Patterns
  typical_response_time INTERVAL, -- Average time to respond
  activity_patterns JSONB, -- When user is most active
  engagement_style TEXT, -- proactive, reactive, lurker, contributor

  -- Metadata
  sample_size INTEGER, -- Number of texts analyzed
  confidence_score FLOAT, -- 0-1 confidence in profile accuracy
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_style_profile_user ON user_style_profile(user_id);
CREATE INDEX idx_user_style_profile_updated ON user_style_profile(last_updated DESC);

-- 5. NGRAM ANALYSIS
-- Stores n-gram patterns for advanced stylometry
CREATE TABLE IF NOT EXISTS user_ngrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  ngram_type TEXT NOT NULL, -- word_bigram, word_trigram, char_bigram, etc.
  ngram_value TEXT NOT NULL, -- The actual n-gram
  frequency INTEGER NOT NULL, -- How often it appears
  tf_idf FLOAT, -- Term frequency-inverse document frequency

  -- Context
  platform TEXT,
  contexts JSONB, -- Example contexts where this n-gram appears

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT user_ngrams_unique UNIQUE (user_id, ngram_type, ngram_value)
);

CREATE INDEX idx_user_ngrams_user ON user_ngrams(user_id);
CREATE INDEX idx_user_ngrams_type ON user_ngrams(ngram_type);
CREATE INDEX idx_user_ngrams_frequency ON user_ngrams(frequency DESC);

-- 6. CONVERSATION CONTEXT MEMORY
-- Stores conversation history for context-aware responses
CREATE TABLE IF NOT EXISTS conversation_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  twin_id UUID REFERENCES digital_twins(id) ON DELETE CASCADE,

  -- Conversation metadata
  conversation_id UUID, -- Groups related messages
  message_role TEXT NOT NULL, -- user, assistant, system
  message_content TEXT NOT NULL,

  -- Context and importance
  importance_score FLOAT DEFAULT 0.5, -- 0-1, how important to remember
  topic_tags TEXT[],
  entities_mentioned JSONB, -- People, places, concepts mentioned

  -- Vector embedding for semantic search
  embedding vector(1536),

  -- Timestamps
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversation_memory_user ON conversation_memory(user_id);
CREATE INDEX idx_conversation_memory_twin ON conversation_memory(twin_id);
CREATE INDEX idx_conversation_memory_conversation ON conversation_memory(conversation_id);
CREATE INDEX idx_conversation_memory_timestamp ON conversation_memory(timestamp DESC);
CREATE INDEX ON conversation_memory USING hnsw (embedding vector_cosine_ops);

-- 7. PLATFORM-SPECIFIC INSIGHTS
-- Aggregated insights from each platform
CREATE TABLE IF NOT EXISTS platform_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,

  -- GitHub Insights
  github_data JSONB, -- repos starred, languages, commit patterns, issue types

  -- Discord Insights
  discord_data JSONB, -- servers, channels, message frequency, interaction style

  -- LinkedIn Insights
  linkedin_data JSONB, -- connections, posts, engagement, professional interests

  -- Spotify Insights (future)
  spotify_data JSONB, -- music taste, listening patterns, playlists

  -- Slack Insights (future)
  slack_data JSONB, -- channels, team dynamics, communication patterns

  -- Aggregated metrics
  total_interactions INTEGER,
  avg_engagement_rate FLOAT,
  preferred_content_types TEXT[],
  peak_activity_times JSONB,

  last_synced TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT platform_insights_unique UNIQUE (user_id, platform)
);

CREATE INDEX idx_platform_insights_user ON platform_insights(user_id);
CREATE INDEX idx_platform_insights_platform ON platform_insights(platform);

-- 8. LLM TRAINING DATA
-- Prepared prompt-completion pairs for fine-tuning
CREATE TABLE IF NOT EXISTS llm_training_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  twin_id UUID REFERENCES digital_twins(id) ON DELETE CASCADE,

  -- Training pair
  prompt TEXT NOT NULL,
  completion TEXT NOT NULL,

  -- Metadata
  source_platform TEXT,
  source_type TEXT, -- conversation, post, code, comment, etc.
  quality_score FLOAT, -- 0-1, quality of this training example

  -- Categorization
  category TEXT, -- technical, personal, creative, professional, etc.
  tags TEXT[],

  -- Usage tracking
  used_in_training BOOLEAN DEFAULT FALSE,
  training_batch_id UUID,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_llm_training_data_user ON llm_training_data(user_id);
CREATE INDEX idx_llm_training_data_twin ON llm_training_data(twin_id);
CREATE INDEX idx_llm_training_data_quality ON llm_training_data(quality_score DESC);
CREATE INDEX idx_llm_training_data_used ON llm_training_data(used_in_training);

-- ============================================================================
-- DATA EXTRACTION JOBS TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  job_type TEXT NOT NULL, -- full_sync, incremental, backfill
  status TEXT NOT NULL, -- pending, running, completed, failed

  -- Progress tracking
  total_items INTEGER,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,

  -- Job details
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,

  -- Results
  results JSONB, -- Summary of extracted data

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_extraction_jobs_user ON data_extraction_jobs(user_id);
CREATE INDEX idx_extraction_jobs_status ON data_extraction_jobs(status);
CREATE INDEX idx_extraction_jobs_created ON data_extraction_jobs(created_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to search similar content using vector embeddings
CREATE OR REPLACE FUNCTION search_similar_content(
  query_embedding vector(1536),
  match_user_id UUID,
  match_platform TEXT DEFAULT NULL,
  match_count INTEGER DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  chunk_text TEXT,
  platform TEXT,
  content_type TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.chunk_text,
    e.platform,
    e.content_type,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM user_embeddings e
  WHERE e.user_id = match_user_id
    AND (match_platform IS NULL OR e.platform = match_platform)
    AND 1 - (e.embedding <=> query_embedding) > similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to get user's writing style summary
CREATE OR REPLACE FUNCTION get_style_summary(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  style_summary JSONB;
BEGIN
  SELECT jsonb_build_object(
    'vocabulary_richness', avg_word_length,
    'sentence_complexity', sentence_complexity,
    'communication_style', communication_style,
    'humor_style', humor_style,
    'personality_traits', personality_traits,
    'topics', topics,
    'interests', interests,
    'confidence_score', confidence_score
  )
  INTO style_summary
  FROM user_style_profile
  WHERE user_id = target_user_id;

  RETURN COALESCE(style_summary, '{}'::JSONB);
END;
$$;

-- Function to aggregate platform statistics
CREATE OR REPLACE FUNCTION get_platform_stats(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  stats JSONB;
BEGIN
  SELECT jsonb_object_agg(
    platform,
    jsonb_build_object(
      'total_items', COUNT(*),
      'processed', COUNT(*) FILTER (WHERE processed = TRUE),
      'latest_extraction', MAX(extracted_at)
    )
  )
  INTO stats
  FROM user_platform_data
  WHERE user_id = target_user_id
  GROUP BY platform;

  RETURN COALESCE(stats, '{}'::JSONB);
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE user_platform_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_text_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_style_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ngrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_training_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_extraction_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY user_platform_data_policy ON user_platform_data
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY user_text_content_policy ON user_text_content
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY user_embeddings_policy ON user_embeddings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY user_style_profile_policy ON user_style_profile
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY user_ngrams_policy ON user_ngrams
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY conversation_memory_policy ON conversation_memory
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY platform_insights_policy ON platform_insights
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY llm_training_data_policy ON llm_training_data
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY data_extraction_jobs_policy ON data_extraction_jobs
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- INITIAL DATA & COMMENTS
-- ============================================================================

COMMENT ON TABLE user_platform_data IS 'Stores raw data extracted from OAuth platforms (GitHub, Discord, LinkedIn, etc.)';
COMMENT ON TABLE user_text_content IS 'Cleaned and normalized text content extracted from platform data';
COMMENT ON TABLE user_embeddings IS 'Vector embeddings for semantic search and RAG (Retrieval-Augmented Generation)';
COMMENT ON TABLE user_style_profile IS 'Stylometric analysis of user writing style, personality, and communication patterns';
COMMENT ON TABLE user_ngrams IS 'N-gram patterns for advanced writing style analysis';
COMMENT ON TABLE conversation_memory IS 'Conversation history with importance scoring for context-aware responses';
COMMENT ON TABLE platform_insights IS 'Aggregated insights and statistics from each connected platform';
COMMENT ON TABLE llm_training_data IS 'Prepared prompt-completion pairs for LLM fine-tuning';
COMMENT ON TABLE data_extraction_jobs IS 'Tracks data extraction jobs from OAuth platforms';

COMMENT ON FUNCTION search_similar_content IS 'Semantic search using vector embeddings (cosine similarity)';
COMMENT ON FUNCTION get_style_summary IS 'Returns user writing style summary as JSON';
COMMENT ON FUNCTION get_platform_stats IS 'Returns aggregated statistics from all connected platforms';
