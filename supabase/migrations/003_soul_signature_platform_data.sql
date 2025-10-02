-- Twin AI Learn - Soul Signature Platform Data
-- Migration 003: Platform-Specific Data Extraction & LLM Training

-- ====================================================================
-- PLATFORM EXTRACTION CONFIGURATIONS
-- ====================================================================

-- Platform-specific extraction settings and capabilities
CREATE TABLE IF NOT EXISTS platform_extraction_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE CHECK (provider IN (
    'spotify', 'youtube', 'discord', 'github', 'netflix', 'instagram', 'twitter', 'steam'
  )),

  -- API configuration
  api_base_url TEXT NOT NULL,
  api_version TEXT,
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,

  -- Available endpoints and data types
  available_endpoints JSONB NOT NULL, -- List of API endpoints we can call
  data_types_supported TEXT[], -- What types of data we can extract

  -- Extraction capabilities
  supports_historical_data BOOLEAN DEFAULT false,
  historical_data_limit_days INTEGER, -- How far back we can go
  requires_business_account BOOLEAN DEFAULT false,
  requires_premium BOOLEAN DEFAULT false,

  -- Cost information
  is_free BOOLEAN DEFAULT true,
  cost_per_month DECIMAL(10,2),
  cost_notes TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_tested TIMESTAMP,
  last_test_status TEXT, -- 'success', 'failed', 'rate_limited'

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ====================================================================
-- SPOTIFY DATA EXTRACTION
-- ====================================================================

-- Spotify listening data
CREATE TABLE IF NOT EXISTS spotify_listening_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  -- Track information
  track_id TEXT NOT NULL,
  track_name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  album_name TEXT,

  -- Listening details
  played_at TIMESTAMP NOT NULL,
  duration_ms INTEGER,
  is_shuffle BOOLEAN,
  is_repeat BOOLEAN,

  -- Audio features
  audio_features JSONB, -- tempo, energy, valence, etc.
  genres TEXT[],

  -- Context
  listening_context TEXT, -- playlist, album, radio, etc.
  device_type TEXT, -- mobile, desktop, speaker

  -- Metadata
  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_spotify_user_time (user_id, played_at DESC),
  INDEX idx_spotify_artist (artist_name),
  INDEX idx_spotify_track (track_id)
);

-- Spotify playlists
CREATE TABLE IF NOT EXISTS spotify_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  playlist_id TEXT NOT NULL,
  playlist_name TEXT NOT NULL,
  playlist_description TEXT,

  is_collaborative BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  owner TEXT,

  total_tracks INTEGER,
  followers_count INTEGER,

  tracks JSONB, -- List of tracks in the playlist

  created_at TIMESTAMP,
  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_spotify_playlists_user (user_id)
);

-- ====================================================================
-- YOUTUBE DATA EXTRACTION
-- ====================================================================

-- YouTube subscriptions
CREATE TABLE IF NOT EXISTS youtube_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  channel_description TEXT,

  subscribed_at TIMESTAMP,
  subscriber_count INTEGER,
  video_count INTEGER,

  channel_categories TEXT[],
  channel_keywords TEXT[],

  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_youtube_subs_user (user_id),
  INDEX idx_youtube_channel (channel_id)
);

-- YouTube activity (likes, comments, uploads)
CREATE TABLE IF NOT EXISTS youtube_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'like', 'comment', 'upload', 'share', 'favorite', 'subscription'
  )),

  video_id TEXT,
  video_title TEXT,
  video_category TEXT,

  channel_id TEXT,
  channel_title TEXT,

  activity_timestamp TIMESTAMP NOT NULL,
  activity_content TEXT, -- For comments

  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_youtube_activity_user_time (user_id, activity_timestamp DESC),
  INDEX idx_youtube_activity_type (activity_type)
);

-- ====================================================================
-- DISCORD DATA EXTRACTION
-- ====================================================================

-- Discord servers (guilds)
CREATE TABLE IF NOT EXISTS discord_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  server_id TEXT NOT NULL,
  server_name TEXT NOT NULL,
  server_icon TEXT,

  member_count INTEGER,
  joined_at TIMESTAMP,

  server_categories TEXT[], -- gaming, tech, art, etc.
  user_roles TEXT[], -- member, moderator, admin

  is_owner BOOLEAN DEFAULT false,
  activity_level TEXT, -- active, moderate, lurker

  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_discord_servers_user (user_id)
);

-- Discord interactions (aggregated, not individual messages for privacy)
CREATE TABLE IF NOT EXISTS discord_interaction_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  server_id TEXT NOT NULL,

  -- Aggregated interaction metrics (no individual messages stored)
  total_messages INTEGER DEFAULT 0,
  messages_per_day_avg DECIMAL(10,2),

  most_active_channels TEXT[],
  most_used_emoji TEXT[],

  voice_channel_hours DECIMAL(10,2),
  reaction_patterns JSONB, -- Types of reactions used

  time_period_start DATE NOT NULL,
  time_period_end DATE NOT NULL,

  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_discord_patterns_user (user_id),
  UNIQUE(user_id, server_id, time_period_start)
);

-- ====================================================================
-- GITHUB DATA EXTRACTION
-- ====================================================================

-- GitHub repositories
CREATE TABLE IF NOT EXISTS github_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  repo_id TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  repo_url TEXT,

  is_owner BOOLEAN,
  is_fork BOOLEAN,
  primary_language TEXT,
  languages_used JSONB, -- Language breakdown

  stars_count INTEGER,
  forks_count INTEGER,
  watchers_count INTEGER,

  topics TEXT[],
  description TEXT,

  created_at TIMESTAMP,
  last_updated TIMESTAMP,
  last_pushed TIMESTAMP,

  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_github_repos_user (user_id),
  INDEX idx_github_repos_language (primary_language)
);

-- GitHub contributions
CREATE TABLE IF NOT EXISTS github_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  contribution_date DATE NOT NULL,
  contribution_count INTEGER NOT NULL,

  commit_count INTEGER DEFAULT 0,
  pr_count INTEGER DEFAULT 0,
  issue_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,

  repositories_contributed TEXT[],

  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_github_contrib_user_date (user_id, contribution_date DESC),
  UNIQUE(user_id, contribution_date)
);

-- ====================================================================
-- NETFLIX DATA (Imported from CSV/DOM Extraction)
-- ====================================================================

-- Netflix viewing history
CREATE TABLE IF NOT EXISTS netflix_viewing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,

  title TEXT NOT NULL,
  series_or_movie TEXT, -- 'series', 'movie', 'documentary'

  watched_at TIMESTAMP NOT NULL,
  duration_watched_minutes INTEGER,
  completion_percentage DECIMAL(5,2),

  genre TEXT,
  sub_genres TEXT[],

  is_binge_watched BOOLEAN DEFAULT false, -- Multiple episodes in short time
  binge_episode_count INTEGER,

  emotional_arc TEXT, -- comedy, drama, thriller, documentary
  content_rating TEXT, -- TV-MA, PG-13, etc.

  import_source TEXT DEFAULT 'csv' CHECK (import_source IN ('csv', 'dom_extraction', 'manual')),
  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_netflix_user_time (user_id, watched_at DESC),
  INDEX idx_netflix_genre (genre)
);

-- ====================================================================
-- INSTAGRAM DATA (Limited due to API deprecation)
-- ====================================================================

-- Instagram posts (if Business/Creator account)
CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  post_id TEXT NOT NULL,
  post_type TEXT CHECK (post_type IN ('image', 'video', 'carousel', 'reel', 'story')),

  caption TEXT,
  hashtags TEXT[],

  posted_at TIMESTAMP NOT NULL,
  like_count INTEGER,
  comment_count INTEGER,

  media_url TEXT,
  thumbnail_url TEXT,

  engagement_rate DECIMAL(5,2),

  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_instagram_user_time (user_id, posted_at DESC)
);

-- ====================================================================
-- TWITTER DATA (Limited due to API costs)
-- ====================================================================

-- Twitter tweets (limited to recent due to API costs)
CREATE TABLE IF NOT EXISTS twitter_tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  tweet_id TEXT NOT NULL,
  tweet_text TEXT NOT NULL,

  tweeted_at TIMESTAMP NOT NULL,

  retweet_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,

  hashtags TEXT[],
  mentioned_users TEXT[],

  is_retweet BOOLEAN DEFAULT false,
  is_reply BOOLEAN DEFAULT false,

  sentiment TEXT, -- positive, negative, neutral (AI-analyzed)

  ingested_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_twitter_user_time (user_id, tweeted_at DESC)
);

-- Twitter interests (inferred from follows and likes)
CREATE TABLE IF NOT EXISTS twitter_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  interest_category TEXT NOT NULL,
  confidence_score DECIMAL(3,2) NOT NULL,

  supporting_accounts TEXT[], -- Accounts followed in this category
  supporting_hashtags TEXT[],

  identified_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_twitter_interests_user (user_id)
);

-- ====================================================================
-- SOUL SIGNATURE INSIGHTS
-- ====================================================================

-- Aggregated soul signature profile
CREATE TABLE IF NOT EXISTS soul_signature_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,

  -- Entertainment signature
  music_signature JSONB, -- Spotify insights: diversity, tempo preferences, mood patterns
  video_signature JSONB, -- YouTube/Netflix: content types, binge patterns, genre preferences
  gaming_signature JSONB, -- Discord/Steam: game types, playstyle, community involvement

  -- Social signature
  communication_signature JSONB, -- Discord/Twitter: tone, frequency, topics
  content_creation_signature JSONB, -- Instagram/Twitter: posting frequency, themes, engagement

  -- Professional signature
  coding_signature JSONB, -- GitHub: languages, contribution patterns, project types
  collaboration_signature JSONB, -- Work tools: meeting patterns, response times

  -- Overall patterns
  curiosity_profile JSONB, -- Topics explored across platforms
  authenticity_score DECIMAL(3,2), -- How consistent personality is across platforms
  uniqueness_markers TEXT[], -- What makes this person distinctly unique

  -- Metadata
  last_updated TIMESTAMP DEFAULT NOW(),
  data_completeness DECIMAL(3,2), -- What % of possible data we have
  confidence_score DECIMAL(3,2), -- How confident we are in this profile

  created_at TIMESTAMP DEFAULT NOW()
);

-- ====================================================================
-- LLM TRAINING CONTEXT
-- ====================================================================

-- Prepared context for LLM training
CREATE TABLE IF NOT EXISTS llm_training_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  twin_id UUID REFERENCES digital_twins(id) ON DELETE CASCADE,

  -- Context categorization
  context_type TEXT NOT NULL CHECK (context_type IN (
    'personality_base', 'communication_style', 'expertise_knowledge',
    'interests_hobbies', 'behavioral_patterns', 'response_examples'
  )),

  -- The actual context data formatted for LLM
  context_content TEXT NOT NULL, -- Human-readable context for system prompt
  context_embedding VECTOR(1536), -- Optional: Vector embedding for semantic search

  -- Source information
  source_platforms TEXT[], -- Which platforms this context came from
  source_data_count INTEGER, -- How many data points contributed
  confidence_score DECIMAL(3,2) NOT NULL,

  -- Version control
  version INTEGER DEFAULT 1,
  supersedes_context_id UUID REFERENCES llm_training_context(id),

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP,
  use_count INTEGER DEFAULT 0,

  INDEX idx_llm_context_user_type (user_id, context_type),
  INDEX idx_llm_context_twin (twin_id),
  INDEX idx_llm_context_confidence (confidence_score DESC)
);

-- LLM conversation seeds (example interactions for few-shot learning)
CREATE TABLE IF NOT EXISTS llm_conversation_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  twin_id UUID REFERENCES digital_twins(id) ON DELETE CASCADE,

  -- Seed conversation
  user_message TEXT NOT NULL,
  twin_response TEXT NOT NULL,

  -- Context
  conversation_topic TEXT,
  response_characteristics TEXT[], -- humor, formal, technical, empathetic

  -- Quality metrics
  quality_score DECIMAL(3,2), -- How good is this as a training example
  was_user_approved BOOLEAN DEFAULT false,

  -- Source
  source_type TEXT CHECK (source_type IN (
    'actual_conversation', 'extracted_pattern', 'synthesized', 'user_provided'
  )),

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_seeds_twin (twin_id),
  INDEX idx_seeds_quality (quality_score DESC) WHERE was_user_approved
);

-- ====================================================================
-- PLATFORM EXTRACTION STATUS TRACKING
-- ====================================================================

-- Track extraction progress for each user-platform combination
CREATE TABLE IF NOT EXISTS extraction_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,

  -- Extraction progress
  extraction_stage TEXT DEFAULT 'not_started' CHECK (extraction_stage IN (
    'not_started', 'oauth_connected', 'initial_extraction', 'ongoing_sync', 'paused', 'failed'
  )),

  -- Data metrics
  total_items_extracted INTEGER DEFAULT 0,
  last_extraction_count INTEGER DEFAULT 0,
  oldest_data_timestamp TIMESTAMP,
  newest_data_timestamp TIMESTAMP,

  -- Next steps
  next_extraction_scheduled TIMESTAMP,
  extraction_frequency INTERVAL DEFAULT '1 hour',

  -- Error handling
  consecutive_errors INTEGER DEFAULT 0,
  last_error_message TEXT,
  last_error_timestamp TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, provider),
  INDEX idx_extraction_status_user (user_id),
  INDEX idx_extraction_status_due (next_extraction_scheduled) WHERE extraction_stage = 'ongoing_sync'
);

-- ====================================================================
-- INITIAL PLATFORM CONFIGURATIONS
-- ====================================================================

-- Insert platform extraction configurations
INSERT INTO platform_extraction_config (provider, api_base_url, available_endpoints, data_types_supported, supports_historical_data, historical_data_limit_days, is_free, last_tested, last_test_status) VALUES
('spotify', 'https://api.spotify.com/v1',
  '["me/top/tracks", "me/top/artists", "me/recently-played", "me/playlists"]'::jsonb,
  ARRAY['recently_played', 'top_tracks', 'playlists', 'audio_features'],
  true, 90, true, NOW(), 'success'),

('youtube', 'https://www.googleapis.com/youtube/v3',
  '["subscriptions", "activities", "channels"]'::jsonb,
  ARRAY['subscriptions', 'activities', 'channels'],
  false, NULL, true, NOW(), 'success'),

('discord', 'https://discord.com/api/v10',
  '["users/@me/guilds", "guilds/{guild}/members/{user}"]'::jsonb,
  ARRAY['servers', 'roles', 'activity_aggregated'],
  false, NULL, true, NOW(), 'success'),

('github', 'https://api.github.com',
  '["user/repos", "graphql"]'::jsonb,
  ARRAY['repositories', 'contributions', 'languages'],
  true, 365, true, NOW(), 'success'),

('netflix', 'N/A',
  '[]'::jsonb,
  ARRAY['viewing_history_csv', 'viewing_history_dom'],
  true, NULL, true, NOW(), 'pending_implementation'),

('instagram', 'https://graph.instagram.com',
  '["me/media"]'::jsonb,
  ARRAY['posts', 'media'],
  true, 90, true, NOW(), 'deprecated_api')
ON CONFLICT (provider) DO NOTHING;

-- ====================================================================
-- HELPER FUNCTIONS
-- ====================================================================

-- Calculate soul signature completeness
CREATE OR REPLACE FUNCTION calculate_soul_signature_completeness(p_user_id TEXT)
RETURNS DECIMAL(3,2) AS $$
DECLARE
  total_platforms INTEGER := 8; -- spotify, youtube, discord, github, netflix, instagram, twitter, steam
  connected_platforms INTEGER;
  data_completeness DECIMAL(3,2);
BEGIN
  -- Count how many platforms have data
  SELECT COUNT(DISTINCT provider) INTO connected_platforms
  FROM data_connectors
  WHERE user_id = p_user_id AND is_active = true;

  data_completeness := (connected_platforms::DECIMAL / total_platforms::DECIMAL);

  RETURN LEAST(data_completeness, 1.0);
END;
$$ LANGUAGE plpgsql;

-- Generate LLM system prompt from soul signature
CREATE OR REPLACE FUNCTION generate_llm_system_prompt(p_user_id TEXT, p_twin_id UUID)
RETURNS TEXT AS $$
DECLARE
  prompt_text TEXT := '';
  signature_data RECORD;
  context_data RECORD;
BEGIN
  -- Get soul signature profile
  SELECT * INTO signature_data
  FROM soul_signature_profile
  WHERE user_id = p_user_id;

  -- Build system prompt
  prompt_text := 'You are a digital twin with the following personality and characteristics:\n\n';

  -- Add personality contexts
  FOR context_data IN
    SELECT context_type, context_content
    FROM llm_training_context
    WHERE twin_id = p_twin_id
    AND confidence_score >= 0.7
    ORDER BY confidence_score DESC, last_used DESC NULLS LAST
    LIMIT 10
  LOOP
    prompt_text := prompt_text || '## ' || context_data.context_type || E'\n';
    prompt_text := prompt_text || context_data.context_content || E'\n\n';
  END LOOP;

  RETURN prompt_text;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- TRIGGERS
-- ====================================================================

-- Update extraction status when new data is extracted
CREATE OR REPLACE FUNCTION update_extraction_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE extraction_status
  SET
    total_items_extracted = total_items_extracted + 1,
    last_extraction_count = last_extraction_count + 1,
    newest_data_timestamp = GREATEST(newest_data_timestamp, NEW.ingested_at),
    updated_at = NOW()
  WHERE user_id = NEW.user_id
    AND connector_id = NEW.connector_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all platform-specific tables
CREATE TRIGGER update_spotify_extraction_status
  AFTER INSERT ON spotify_listening_data
  FOR EACH ROW EXECUTE FUNCTION update_extraction_status();

CREATE TRIGGER update_youtube_extraction_status
  AFTER INSERT ON youtube_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_extraction_status();

CREATE TRIGGER update_discord_extraction_status
  AFTER INSERT ON discord_servers
  FOR EACH ROW EXECUTE FUNCTION update_extraction_status();

CREATE TRIGGER update_github_extraction_status
  AFTER INSERT ON github_repositories
  FOR EACH ROW EXECUTE FUNCTION update_extraction_status();

CREATE TRIGGER update_netflix_extraction_status
  AFTER INSERT ON netflix_viewing_history
  FOR EACH ROW EXECUTE FUNCTION update_extraction_status();

-- ====================================================================
-- VIEWS
-- ====================================================================

-- User's complete data extraction overview
CREATE OR REPLACE VIEW user_data_extraction_overview AS
SELECT
  es.user_id,
  es.provider,
  es.extraction_stage,
  es.total_items_extracted,
  es.oldest_data_timestamp,
  es.newest_data_timestamp,
  dc.connected_at,
  dc.last_sync,
  dc.is_active,
  pec.supports_historical_data,
  pec.is_free,
  pec.requires_premium
FROM extraction_status es
JOIN data_connectors dc ON es.connector_id = dc.id
JOIN platform_extraction_config pec ON es.provider = pec.provider;

-- Twin's LLM readiness status
CREATE OR REPLACE VIEW twin_llm_readiness AS
SELECT
  dt.id as twin_id,
  dt.name as twin_name,
  dt.creator_id as user_id,
  COUNT(DISTINCT ltc.context_type) as context_types_count,
  AVG(ltc.confidence_score) as avg_context_confidence,
  COUNT(lcs.id) as conversation_seeds_count,
  ssp.data_completeness,
  ssp.authenticity_score,
  CASE
    WHEN COUNT(DISTINCT ltc.context_type) >= 4
      AND AVG(ltc.confidence_score) >= 0.7
      AND ssp.data_completeness >= 0.5
    THEN 'ready'
    WHEN COUNT(DISTINCT ltc.context_type) >= 2
      AND AVG(ltc.confidence_score) >= 0.5
    THEN 'partial'
    ELSE 'not_ready'
  END as llm_readiness_status
FROM digital_twins dt
LEFT JOIN llm_training_context ltc ON dt.id = ltc.twin_id
LEFT JOIN llm_conversation_seeds lcs ON dt.id = lcs.twin_id
LEFT JOIN soul_signature_profile ssp ON dt.creator_id = ssp.user_id
GROUP BY dt.id, dt.name, dt.creator_id, ssp.data_completeness, ssp.authenticity_score;

-- ====================================================================
-- COMMENTS
-- ====================================================================

COMMENT ON TABLE platform_extraction_config IS 'Configuration for each platform''s data extraction capabilities and limitations';
COMMENT ON TABLE soul_signature_profile IS 'Aggregated soul signature profile combining all platform insights';
COMMENT ON TABLE llm_training_context IS 'Prepared context chunks for training/prompting the user''s digital twin LLM';
COMMENT ON TABLE llm_conversation_seeds IS 'Example conversations for few-shot learning and personality demonstration';
COMMENT ON TABLE extraction_status IS 'Tracks the extraction progress and status for each user-platform connection';

-- Migration complete
-- Next: Implement data extraction services for each platform
