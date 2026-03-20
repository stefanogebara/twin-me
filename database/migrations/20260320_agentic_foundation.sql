-- =============================================================================
-- AGENTIC FOUNDATION MIGRATION
-- Phase 1 of TwinMe Agentic Platform Evolution
--
-- Creates 6 tables:
--   1. core_memory_blocks     - Pinned context blocks (Soul Signature, Human, Goals, Recent)
--   2. prospective_memories   - Time/event/condition triggered future actions
--   3. agent_actions          - Outcome tracking for all twin actions
--   4. skill_definitions      - Registered skills the twin can execute
--   5. user_skill_settings    - Per-user autonomy overrides per skill
--   6. agent_events           - Lightweight append-only audit log
--
-- Research sources:
--   Letta Memory Blocks, Identity Drift (arXiv:2412.00804),
--   Kumiho Prospective Memory (arXiv:2603.17244),
--   CoALA Cognitive Architecture (arXiv:2309.02427),
--   Reflexion (arXiv:2303.11366)
-- =============================================================================

-- 1. Core Memory Blocks
-- Pinned, always-in-context blocks for stable twin personality and user knowledge.
-- SOUL_SIGNATURE is immutable at runtime (identity anchor, prevents drift).
-- HUMAN, GOALS, RECENT_CONTEXT are editable by the twin via tool calls.
CREATE TABLE IF NOT EXISTS core_memory_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_name TEXT NOT NULL,
  block_content TEXT NOT NULL DEFAULT '',
  max_chars INT NOT NULL DEFAULT 1500,
  is_immutable BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system',
  UNIQUE(user_id, block_name)
);

CREATE INDEX IF NOT EXISTS idx_core_memory_blocks_user
  ON core_memory_blocks(user_id);

COMMENT ON TABLE core_memory_blocks IS
  'Pinned context blocks always injected into twin system prompt. Based on Letta Memory Blocks architecture.';

-- 2. Prospective Memories
-- "Remember to do X when Y happens" — time, event, or condition triggers.
-- The twin creates these during conversation; cron checks for triggers.
CREATE TABLE IF NOT EXISTS prospective_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('time', 'event', 'condition')),
  trigger_spec JSONB NOT NULL,
  action TEXT NOT NULL,
  context TEXT,
  source TEXT DEFAULT 'conversation',
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'triggered', 'completed', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  triggered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prospective_pending
  ON prospective_memories(user_id, status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_prospective_time_trigger
  ON prospective_memories(status, trigger_type)
  WHERE status = 'pending' AND trigger_type = 'time';

COMMENT ON TABLE prospective_memories IS
  'Future-triggered memories. Based on Kumiho (arXiv:2603.17244) prospective indexing.';

-- 3. Agent Actions
-- Tracks all twin actions with outcomes for procedural memory learning.
-- Every suggestion, draft, execution, nudge, and reminder is logged.
CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name TEXT, -- References skill_definitions.name (TEXT), not .id (UUID)
  action_type TEXT NOT NULL
    CHECK (action_type IN ('suggestion', 'draft', 'execution', 'nudge', 'reminder', 'briefing')),
  action_content TEXT NOT NULL,
  autonomy_level INT NOT NULL DEFAULT 1 CHECK (autonomy_level BETWEEN 0 AND 4),
  user_response TEXT CHECK (user_response IN (
    'accepted', 'rejected', 'modified', 'ignored', NULL
  )),
  outcome_data JSONB,
  personality_context JSONB,
  platform_sources TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_user
  ON agent_actions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_actions_skill
  ON agent_actions(user_id, skill_name, created_at DESC);

COMMENT ON TABLE agent_actions IS
  'All twin actions with outcome tracking. Feeds procedural memory generation.';

-- 4. Skill Definitions
-- Registered skills the twin can execute. Platform-agnostic.
-- Each skill declares what tools it needs and its default autonomy level.
CREATE TABLE IF NOT EXISTS skill_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  trigger_type TEXT,
  trigger_spec JSONB,
  actions JSONB NOT NULL DEFAULT '[]',
  required_platforms TEXT[] DEFAULT '{}',
  required_tools TEXT[] DEFAULT '{}',
  default_autonomy_level INT NOT NULL DEFAULT 1 CHECK (default_autonomy_level BETWEEN 0 AND 4),
  is_system BOOLEAN DEFAULT true,
  is_enabled BOOLEAN DEFAULT true,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE skill_definitions IS
  'Registered skills the twin can execute. Inspired by OpenClaw SKILL.md pattern.';

-- 5. User Skill Settings
-- Per-user autonomy level overrides and enable/disable per skill.
CREATE TABLE IF NOT EXISTS user_skill_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skill_definitions(id) ON DELETE CASCADE,
  autonomy_level INT NOT NULL CHECK (autonomy_level BETWEEN 0 AND 4),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  custom_config JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_user_skill_settings_user
  ON user_skill_settings(user_id);

COMMENT ON TABLE user_skill_settings IS
  'Per-user autonomy overrides. Implements the Autonomy Spectrum (0=observe, 4=full auto).';

-- 6. Agent Events (Lightweight Audit Log)
-- Append-only log of all agent-related events for debugging and replay.
-- Inspired by OpenHands event-sourced architecture.
CREATE TABLE IF NOT EXISTS agent_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}',
  source TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_user
  ON agent_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_type
  ON agent_events(event_type, created_at DESC);

COMMENT ON TABLE agent_events IS
  'Append-only audit log. Based on event-sourcing pattern from OpenHands SDK.';

-- =============================================================================
-- SEED: Default skill definitions
-- =============================================================================

INSERT INTO skill_definitions (name, display_name, description, category, trigger_type, trigger_spec, actions, required_platforms, default_autonomy_level)
VALUES
  (
    'morning_briefing',
    'Morning Briefing',
    'Personalized daily briefing at wake time. Covers calendar, health metrics, weather, and a mood-appropriate greeting in your communication style.',
    'daily_rituals',
    'time',
    '{"adaptive": true, "source": "whoop_wake_time", "fallback_hour": 7}',
    '[{"step": "gather_calendar"}, {"step": "gather_health"}, {"step": "gather_weather"}, {"step": "compose_briefing"}, {"step": "deliver"}]',
    ARRAY['google_calendar', 'whoop'],
    3
  ),
  (
    'evening_recap',
    'Evening Recap',
    'Daily recap of what happened: meetings completed, health metrics, notable patterns, and a suggestion for the evening based on your energy and personality.',
    'daily_rituals',
    'time',
    '{"adaptive": true, "source": "pattern_evening", "fallback_hour": 20}',
    '[{"step": "gather_day_data"}, {"step": "analyze_patterns"}, {"step": "compose_recap"}, {"step": "deliver"}]',
    ARRAY['google_calendar', 'whoop', 'spotify'],
    3
  ),
  (
    'music_mood_match',
    'Music Mood Match',
    'Detects your current state from health metrics, calendar context, and time of day, then suggests or queues a Spotify playlist that matches.',
    'content_curation',
    'event',
    '{"on": "whoop_recovery_available"}',
    '[{"step": "assess_state"}, {"step": "match_playlist"}, {"step": "suggest_or_queue"}]',
    ARRAY['spotify', 'whoop'],
    1
  ),
  (
    'pattern_alert',
    'Pattern Alert',
    'Detects unusual behavioral patterns across platforms and alerts you. Examples: sleep declining, unusual music at odd hours, calendar overload.',
    'self_discovery',
    'threshold',
    '{"check_interval_hours": 6}',
    '[{"step": "scan_recent_data"}, {"step": "detect_anomalies"}, {"step": "compose_alert"}, {"step": "deliver"}]',
    '{}',
    1
  ),
  (
    'social_checkin',
    'Social Check-in',
    'Notices when you haven''t interacted with close contacts in a while and suggests a check-in message in your communication style.',
    'social_intelligence',
    'condition',
    '{"check_interval_days": 7}',
    '[{"step": "scan_social_gaps"}, {"step": "draft_message"}, {"step": "suggest"}]',
    ARRAY['google_calendar', 'discord'],
    1
  )
ON CONFLICT (name) DO NOTHING;
