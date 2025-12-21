-- Music Agent Tables
-- Comprehensive schema for AI Music Agent that learns preferences and automates playlist creation

-- ================================================
-- AGENT MUSIC PREFERENCES
-- Stores learned preferences from Spotify listening history
-- ================================================
CREATE TABLE IF NOT EXISTS agent_music_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Audio Feature Preferences (learned from listening history)
  preferred_valence DECIMAL(3,2), -- 0.0-1.0 (sad to happy)
  preferred_energy DECIMAL(3,2), -- 0.0-1.0 (calm to energetic)
  preferred_danceability DECIMAL(3,2), -- 0.0-1.0
  preferred_tempo INTEGER, -- BPM
  preferred_acousticness DECIMAL(3,2), -- 0.0-1.0
  preferred_instrumentalness DECIMAL(3,2), -- 0.0-1.0
  preferred_speechiness DECIMAL(3,2), -- 0.0-1.0

  -- Genre Preferences (JSONB array of genres with weights)
  genre_preferences JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"genre": "indie rock", "weight": 0.8}, {"genre": "electronic", "weight": 0.6}]

  -- Artist Preferences (JSONB array of artist IDs with weights)
  artist_preferences JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"artist_id": "spotify:artist:xyz", "name": "Artist Name", "weight": 0.9}]

  -- Listening Patterns
  listening_patterns JSONB DEFAULT '{}'::jsonb,
  -- Example: {"morning": "energetic", "evening": "calm", "weekend": "upbeat"}

  -- Mood Preferences (derived from audio features + context)
  mood_preferences JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"mood": "focus", "tracks": 120}, {"mood": "workout", "tracks": 85}]

  -- Learning Metrics
  total_tracks_analyzed INTEGER DEFAULT 0,
  confidence_score DECIMAL(3,2) DEFAULT 0.00, -- 0.00-1.00
  last_learning_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_music_prefs_user ON agent_music_preferences(user_id);

-- ================================================
-- AGENT MUSIC TRACKS
-- Stores analyzed Spotify tracks with audio features for fast recommendations
-- ================================================
CREATE TABLE IF NOT EXISTS agent_music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Spotify Track Info
  spotify_track_id TEXT NOT NULL, -- e.g., "spotify:track:xyz"
  track_name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  album_name TEXT,
  duration_ms INTEGER,
  release_date TEXT,

  -- Audio Features (from Spotify Audio Features API)
  acousticness DECIMAL(3,2),
  danceability DECIMAL(3,2),
  energy DECIMAL(3,2),
  instrumentalness DECIMAL(3,2),
  liveness DECIMAL(3,2),
  loudness DECIMAL(5,2),
  speechiness DECIMAL(3,2),
  tempo DECIMAL(6,2),
  time_signature INTEGER,
  valence DECIMAL(3,2),

  -- Analysis Results
  genres JSONB DEFAULT '[]'::jsonb, -- Array of genre strings
  mood_tags JSONB DEFAULT '[]'::jsonb, -- ["happy", "energetic", "uplifting"]
  activity_tags JSONB DEFAULT '[]'::jsonb, -- ["workout", "focus", "party"]

  -- User Interaction
  play_count INTEGER DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  user_rating INTEGER, -- 1-5 stars (optional explicit rating)

  -- Vector Embedding (for similarity search - future enhancement)
  embedding_vector DECIMAL(5,4)[], -- Vector representation of track features

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, spotify_track_id)
);

CREATE INDEX idx_music_tracks_user ON agent_music_tracks(user_id);
CREATE INDEX idx_music_tracks_spotify_id ON agent_music_tracks(spotify_track_id);
CREATE INDEX idx_music_tracks_play_count ON agent_music_tracks(play_count DESC);
CREATE INDEX idx_music_tracks_valence ON agent_music_tracks(valence);
CREATE INDEX idx_music_tracks_energy ON agent_music_tracks(energy);

-- ================================================
-- AGENT MUSIC PLAYLISTS
-- Stores AI-generated playlists
-- ================================================
CREATE TABLE IF NOT EXISTS agent_music_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Playlist Info
  name TEXT NOT NULL,
  description TEXT,
  playlist_type TEXT NOT NULL, -- 'mood', 'activity', 'discovery', 'time_based', 'custom'

  -- Generation Parameters
  generation_prompt TEXT, -- User's original request
  target_mood TEXT, -- e.g., "focus", "workout", "chill"
  target_activity TEXT, -- e.g., "coding", "running", "studying"
  target_duration_minutes INTEGER, -- Desired playlist length

  -- Spotify Integration
  spotify_playlist_id TEXT, -- ID if synced to Spotify
  spotify_playlist_url TEXT,
  is_synced_to_spotify BOOLEAN DEFAULT false,

  -- Track List (JSONB array of track IDs)
  tracks JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"spotify_track_id": "xyz", "position": 1, "reason": "matches your morning energy"}]

  -- Audio Feature Targets (used for generation)
  target_valence DECIMAL(3,2),
  target_energy DECIMAL(3,2),
  target_danceability DECIMAL(3,2),
  target_tempo INTEGER,

  -- Generation Quality Metrics
  diversity_score DECIMAL(3,2), -- How varied the playlist is
  relevance_score DECIMAL(3,2), -- How well it matches user preferences
  novelty_score DECIMAL(3,2), -- How many new discoveries vs familiar tracks

  -- User Feedback
  user_rating INTEGER, -- 1-5 stars
  user_feedback TEXT,
  times_played INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_music_playlists_user ON agent_music_playlists(user_id);
CREATE INDEX idx_music_playlists_type ON agent_music_playlists(playlist_type);
CREATE INDEX idx_music_playlists_created ON agent_music_playlists(created_at DESC);

-- ================================================
-- AGENT TASKS
-- Universal task queue for all AI agents (Music, Email, Calendar, etc.)
-- ================================================
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Task Identity
  agent_type TEXT NOT NULL, -- 'music', 'email', 'calendar', 'content', 'research'
  task_type TEXT NOT NULL, -- 'reactive', 'scheduled', 'on_demand'
  task_name TEXT NOT NULL, -- Human-readable name

  -- Task Details
  task_prompt TEXT, -- User's original request
  task_parameters JSONB DEFAULT '{}'::jsonb, -- Agent-specific parameters
  -- Example for Music Agent: {"mood": "focus", "duration": 60, "include_new": true}

  -- Execution Status
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'cancelled'
  priority INTEGER DEFAULT 5, -- 1-10 (10 = highest priority)

  -- Scheduling
  scheduled_for TIMESTAMPTZ, -- When to execute (NULL = immediate)
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Execution Results
  result JSONB, -- Agent's output
  error_message TEXT,
  execution_time_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_tasks_user ON agent_tasks(user_id);
CREATE INDEX idx_agent_tasks_agent_type ON agent_tasks(agent_type);
CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_tasks_scheduled ON agent_tasks(scheduled_for);
CREATE INDEX idx_agent_tasks_priority ON agent_tasks(priority DESC);

-- ================================================
-- AGENT MEMORY
-- Three-tier memory system for all agents
-- ================================================
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Memory Identity
  agent_type TEXT NOT NULL, -- 'music', 'email', 'calendar', etc.
  memory_tier TEXT NOT NULL, -- 'short_term', 'medium_term', 'long_term'
  memory_type TEXT NOT NULL, -- 'preference', 'pattern', 'insight', 'context'

  -- Memory Content
  key TEXT NOT NULL, -- Unique identifier for this memory
  value JSONB NOT NULL, -- The actual memory data
  confidence DECIMAL(3,2) DEFAULT 0.50, -- 0.00-1.00

  -- Memory Metadata
  source TEXT, -- Where this memory came from (e.g., 'spotify_analysis', 'user_feedback')
  relevance_score DECIMAL(3,2) DEFAULT 0.50, -- How relevant this memory is
  access_count INTEGER DEFAULT 0, -- How often this memory is accessed
  last_accessed_at TIMESTAMPTZ,

  -- Expiration (for short-term and medium-term memory)
  expires_at TIMESTAMPTZ, -- NULL = permanent (long-term)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, agent_type, memory_tier, key)
);

CREATE INDEX idx_agent_memory_user ON agent_memory(user_id);
CREATE INDEX idx_agent_memory_agent_type ON agent_memory(agent_type);
CREATE INDEX idx_agent_memory_tier ON agent_memory(memory_tier);
CREATE INDEX idx_agent_memory_expires ON agent_memory(expires_at);
CREATE INDEX idx_agent_memory_relevance ON agent_memory(relevance_score DESC);

-- ================================================
-- AGENT INSIGHTS
-- Discovered patterns and insights from user data
-- ================================================
CREATE TABLE IF NOT EXISTS agent_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Insight Identity
  agent_type TEXT NOT NULL, -- 'music', 'email', 'calendar', etc.
  insight_type TEXT NOT NULL, -- 'pattern', 'preference', 'anomaly', 'recommendation'

  -- Insight Content
  title TEXT NOT NULL, -- Human-readable title
  description TEXT NOT NULL, -- Detailed explanation
  insight_data JSONB DEFAULT '{}'::jsonb, -- Supporting data

  -- Insight Metrics
  confidence DECIMAL(3,2) DEFAULT 0.50, -- 0.00-1.00
  importance INTEGER DEFAULT 5, -- 1-10

  -- User Interaction
  is_acknowledged BOOLEAN DEFAULT false,
  is_actionable BOOLEAN DEFAULT false,
  user_action_taken TEXT, -- 'accepted', 'rejected', 'modified'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_insights_user ON agent_insights(user_id);
CREATE INDEX idx_agent_insights_agent_type ON agent_insights(agent_type);
CREATE INDEX idx_agent_insights_acknowledged ON agent_insights(is_acknowledged);
CREATE INDEX idx_agent_insights_importance ON agent_insights(importance DESC);

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================

-- Enable RLS on all tables
ALTER TABLE agent_music_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_music_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_insights ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only access their own data
CREATE POLICY "Users can view their own music preferences"
  ON agent_music_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own music preferences"
  ON agent_music_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own music preferences"
  ON agent_music_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own music tracks"
  ON agent_music_tracks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own music tracks"
  ON agent_music_tracks FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own playlists"
  ON agent_music_playlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own playlists"
  ON agent_music_playlists FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own tasks"
  ON agent_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own tasks"
  ON agent_tasks FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own agent memory"
  ON agent_memory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own agent memory"
  ON agent_memory FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own insights"
  ON agent_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own insights"
  ON agent_insights FOR ALL
  USING (auth.uid() = user_id);

-- ================================================
-- FUNCTIONS AND TRIGGERS
-- ================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_music_preferences_updated_at BEFORE UPDATE ON agent_music_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_music_tracks_updated_at BEFORE UPDATE ON agent_music_tracks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_music_playlists_updated_at BEFORE UPDATE ON agent_music_playlists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_tasks_updated_at BEFORE UPDATE ON agent_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_memory_updated_at BEFORE UPDATE ON agent_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- COMMENTS (Documentation)
-- ================================================

COMMENT ON TABLE agent_music_preferences IS 'Stores learned music preferences for each user from Spotify listening history analysis';
COMMENT ON TABLE agent_music_tracks IS 'Analyzed Spotify tracks with audio features for fast similarity-based recommendations';
COMMENT ON TABLE agent_music_playlists IS 'AI-generated playlists with mood/activity targeting and quality metrics';
COMMENT ON TABLE agent_tasks IS 'Universal task queue for all AI agents supporting reactive, scheduled, and on-demand execution';
COMMENT ON TABLE agent_memory IS 'Three-tier memory system (short/medium/long-term) for agent learning and context retention';
COMMENT ON TABLE agent_insights IS 'Discovered patterns and actionable insights from user data analysis';
