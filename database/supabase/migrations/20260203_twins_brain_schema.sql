-- ====================================================================
-- TWINS BRAIN - Unified Knowledge Graph Schema
-- Migration: 20260203_twins_brain_schema.sql
--
-- Creates the core tables for the Twins Brain architecture:
-- - brain_nodes: Knowledge nodes (interests, behaviors, traits, patterns)
-- - brain_edges: Connections between nodes with relationship types
-- - brain_snapshots: Temporal snapshots for evolution tracking
-- ====================================================================

-- ====================================================================
-- BRAIN NODES TABLE
-- Stores all knowledge nodes: interests, behaviors, traits, preferences,
-- skills, patterns, and facts discovered about the user
-- ====================================================================

CREATE TABLE IF NOT EXISTS brain_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Node Classification
  node_type VARCHAR(50) NOT NULL, -- 'interest', 'behavior', 'trait', 'preference', 'skill', 'pattern', 'fact'
  category VARCHAR(50) NOT NULL,  -- 'entertainment', 'professional', 'social', 'creative', 'health'

  -- Node Data
  label VARCHAR(255) NOT NULL,    -- Human-readable label
  description TEXT,               -- Optional detailed description
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),   -- How certain we are (0.0-1.0)
  strength FLOAT DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),         -- How strong this attribute is (0.0-1.0)

  -- Source Tracking (where did this node come from?)
  source_type VARCHAR(50),        -- 'moltbot_episodic', 'moltbot_semantic', 'behavioral_pattern', 'claude_conversation', 'platform_data', 'manual'
  source_id UUID,                 -- Reference to source record
  platform VARCHAR(50),           -- Originating platform if applicable (spotify, calendar, etc.)

  -- Flexible Data Storage
  data JSONB DEFAULT '{}',        -- Flexible additional data
  tags TEXT[] DEFAULT '{}',       -- Searchable tags

  -- Temporal Tracking
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  last_confirmed TIMESTAMPTZ,     -- When user/system last verified this

  -- Privacy & Sharing Controls
  privacy_level INT DEFAULT 50 CHECK (privacy_level >= 0 AND privacy_level <= 100),   -- 0-100 revelation intensity
  shared_with_twin BOOLEAN DEFAULT TRUE,
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Node type validation
ALTER TABLE brain_nodes ADD CONSTRAINT brain_nodes_type_check
  CHECK (node_type IN ('interest', 'behavior', 'trait', 'preference', 'skill', 'pattern', 'fact'));

-- Category validation
ALTER TABLE brain_nodes ADD CONSTRAINT brain_nodes_category_check
  CHECK (category IN ('entertainment', 'professional', 'social', 'creative', 'health', 'personal', 'learning'));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_brain_nodes_user ON brain_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_brain_nodes_type ON brain_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_brain_nodes_category ON brain_nodes(category);
CREATE INDEX IF NOT EXISTS idx_brain_nodes_confidence ON brain_nodes(confidence) WHERE confidence >= 0.7;
CREATE INDEX IF NOT EXISTS idx_brain_nodes_tags ON brain_nodes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_brain_nodes_data ON brain_nodes USING GIN(data);
CREATE INDEX IF NOT EXISTS idx_brain_nodes_platform ON brain_nodes(platform) WHERE platform IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brain_nodes_source ON brain_nodes(source_type);
CREATE INDEX IF NOT EXISTS idx_brain_nodes_label ON brain_nodes(user_id, label);

-- ====================================================================
-- BRAIN EDGES TABLE
-- Stores connections between nodes with relationship types and strength
-- ====================================================================

CREATE TABLE IF NOT EXISTS brain_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Connection (bidirectional reference)
  from_node_id UUID REFERENCES brain_nodes(id) ON DELETE CASCADE,
  to_node_id UUID REFERENCES brain_nodes(id) ON DELETE CASCADE,

  -- Relationship Type
  relationship_type VARCHAR(50) NOT NULL, -- 'correlates_with', 'leads_to', 'evolved_from', 'contradicts', 'reinforces', 'context_specific'

  -- Strength & Context
  strength FLOAT DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),     -- Connection strength (0.0-1.0)
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1), -- How certain we are about this connection
  context VARCHAR(50),            -- 'professional', 'personal', 'social', 'health', 'morning_routine', etc.

  -- Evidence Supporting This Connection
  evidence JSONB DEFAULT '[]',    -- Array of supporting data points
  observation_count INT DEFAULT 1,

  -- Temporal
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_observed TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate edges (same nodes + relationship + context)
  CONSTRAINT brain_edges_unique UNIQUE(from_node_id, to_node_id, relationship_type, context)
);

-- Relationship type validation
ALTER TABLE brain_edges ADD CONSTRAINT brain_edges_relationship_check
  CHECK (relationship_type IN ('correlates_with', 'leads_to', 'evolved_from', 'contradicts', 'reinforces', 'context_specific', 'similar_to', 'requires'));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_brain_edges_user ON brain_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_brain_edges_from ON brain_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_brain_edges_to ON brain_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_brain_edges_type ON brain_edges(relationship_type);
CREATE INDEX IF NOT EXISTS idx_brain_edges_strength ON brain_edges(strength) WHERE strength >= 0.7;
CREATE INDEX IF NOT EXISTS idx_brain_edges_context ON brain_edges(context) WHERE context IS NOT NULL;

-- ====================================================================
-- BRAIN SNAPSHOTS TABLE
-- Stores temporal snapshots of the brain state for evolution tracking
-- ====================================================================

CREATE TABLE IF NOT EXISTS brain_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Snapshot Data
  snapshot_date TIMESTAMPTZ NOT NULL,
  graph_state JSONB NOT NULL,    -- Full graph snapshot for time-travel queries

  -- Metadata
  node_count INT,
  edge_count INT,
  avg_confidence FLOAT,
  top_categories TEXT[],         -- Most prominent categories at this time
  snapshot_type VARCHAR(50) DEFAULT 'automatic', -- 'automatic', 'manual', 'milestone', 'weekly', 'monthly'
  notes TEXT,

  -- Change tracking
  nodes_added INT DEFAULT 0,
  nodes_removed INT DEFAULT 0,
  edges_added INT DEFAULT 0,
  edges_removed INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Snapshot type validation
ALTER TABLE brain_snapshots ADD CONSTRAINT brain_snapshots_type_check
  CHECK (snapshot_type IN ('automatic', 'manual', 'milestone', 'weekly', 'monthly', 'daily'));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_brain_snapshots_user ON brain_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_brain_snapshots_date ON brain_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_brain_snapshots_type ON brain_snapshots(snapshot_type);

-- ====================================================================
-- BRAIN ACTIVITY LOG
-- Tracks all changes to the brain for debugging and evolution analysis
-- ====================================================================

CREATE TABLE IF NOT EXISTS brain_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Activity Details
  activity_type VARCHAR(50) NOT NULL, -- 'node_created', 'node_updated', 'edge_created', 'edge_strengthened', 'snapshot_taken'
  entity_type VARCHAR(20) NOT NULL,   -- 'node', 'edge', 'snapshot'
  entity_id UUID,                     -- Reference to the affected entity

  -- Change Details
  change_data JSONB DEFAULT '{}',     -- What changed
  trigger_source VARCHAR(50),         -- What triggered this activity
  trigger_id UUID,                    -- Reference to triggering entity

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_brain_activity_user ON brain_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_brain_activity_type ON brain_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_brain_activity_date ON brain_activity_log(created_at DESC);

-- ====================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- Auto-updates the updated_at column on row modifications
-- ====================================================================

CREATE OR REPLACE FUNCTION update_brain_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to brain_nodes
DROP TRIGGER IF EXISTS brain_nodes_updated_at ON brain_nodes;
CREATE TRIGGER brain_nodes_updated_at
  BEFORE UPDATE ON brain_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_brain_updated_at();

-- Apply trigger to brain_edges
DROP TRIGGER IF EXISTS brain_edges_updated_at ON brain_edges;
CREATE TRIGGER brain_edges_updated_at
  BEFORE UPDATE ON brain_edges
  FOR EACH ROW
  EXECUTE FUNCTION update_brain_updated_at();

-- ====================================================================
-- HELPER FUNCTIONS FOR BRAIN QUERIES
-- ====================================================================

-- Function to get all connected nodes (1-hop neighbors)
CREATE OR REPLACE FUNCTION get_brain_neighbors(
  p_user_id UUID,
  p_node_id UUID,
  p_relationship_type VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  node_id UUID,
  label VARCHAR,
  node_type VARCHAR,
  category VARCHAR,
  confidence FLOAT,
  edge_strength FLOAT,
  relationship_type VARCHAR,
  direction VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id AS node_id,
    n.label,
    n.node_type,
    n.category,
    n.confidence,
    e.strength AS edge_strength,
    e.relationship_type,
    CASE
      WHEN e.from_node_id = p_node_id THEN 'outgoing'
      ELSE 'incoming'
    END AS direction
  FROM brain_edges e
  JOIN brain_nodes n ON (
    CASE
      WHEN e.from_node_id = p_node_id THEN e.to_node_id = n.id
      ELSE e.from_node_id = n.id
    END
  )
  WHERE e.user_id = p_user_id
    AND (e.from_node_id = p_node_id OR e.to_node_id = p_node_id)
    AND (p_relationship_type IS NULL OR e.relationship_type = p_relationship_type);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate brain health score
CREATE OR REPLACE FUNCTION calculate_brain_health(p_user_id UUID)
RETURNS TABLE (
  total_nodes INT,
  total_edges INT,
  avg_confidence FLOAT,
  avg_edge_strength FLOAT,
  category_distribution JSONB,
  health_score FLOAT
) AS $$
DECLARE
  v_total_nodes INT;
  v_total_edges INT;
  v_avg_confidence FLOAT;
  v_avg_edge_strength FLOAT;
  v_category_dist JSONB;
  v_health_score FLOAT;
BEGIN
  -- Get node stats
  SELECT COUNT(*), AVG(confidence)
  INTO v_total_nodes, v_avg_confidence
  FROM brain_nodes WHERE user_id = p_user_id;

  -- Get edge stats
  SELECT COUNT(*), AVG(strength)
  INTO v_total_edges, v_avg_edge_strength
  FROM brain_edges WHERE user_id = p_user_id;

  -- Get category distribution
  SELECT jsonb_object_agg(category, cnt)
  INTO v_category_dist
  FROM (
    SELECT category, COUNT(*) as cnt
    FROM brain_nodes
    WHERE user_id = p_user_id
    GROUP BY category
  ) cats;

  -- Calculate health score (weighted combination)
  v_health_score := LEAST(1.0,
    (COALESCE(v_total_nodes, 0)::FLOAT / 50) * 0.3 +  -- Node count (max 50)
    (COALESCE(v_total_edges, 0)::FLOAT / 100) * 0.2 +  -- Edge count (max 100)
    COALESCE(v_avg_confidence, 0) * 0.25 +              -- Average confidence
    COALESCE(v_avg_edge_strength, 0) * 0.25             -- Average edge strength
  );

  RETURN QUERY SELECT
    COALESCE(v_total_nodes, 0),
    COALESCE(v_total_edges, 0),
    COALESCE(v_avg_confidence, 0.0),
    COALESCE(v_avg_edge_strength, 0.0),
    COALESCE(v_category_dist, '{}'::JSONB),
    COALESCE(v_health_score, 0.0);
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS)
-- ====================================================================

-- Enable RLS on all brain tables
ALTER TABLE brain_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_activity_log ENABLE ROW LEVEL SECURITY;

-- Policies for brain_nodes
CREATE POLICY brain_nodes_select ON brain_nodes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY brain_nodes_insert ON brain_nodes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY brain_nodes_update ON brain_nodes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY brain_nodes_delete ON brain_nodes
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for brain_edges
CREATE POLICY brain_edges_select ON brain_edges
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY brain_edges_insert ON brain_edges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY brain_edges_update ON brain_edges
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY brain_edges_delete ON brain_edges
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for brain_snapshots
CREATE POLICY brain_snapshots_select ON brain_snapshots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY brain_snapshots_insert ON brain_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY brain_snapshots_delete ON brain_snapshots
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for brain_activity_log
CREATE POLICY brain_activity_log_select ON brain_activity_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY brain_activity_log_insert ON brain_activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- SERVICE ROLE BYPASS (for backend operations)
-- ====================================================================

-- Allow service role to bypass RLS for backend operations
CREATE POLICY brain_nodes_service ON brain_nodes
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY brain_edges_service ON brain_edges
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY brain_snapshots_service ON brain_snapshots
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY brain_activity_log_service ON brain_activity_log
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ====================================================================
-- COMMENTS FOR DOCUMENTATION
-- ====================================================================

COMMENT ON TABLE brain_nodes IS 'Core knowledge nodes representing interests, behaviors, traits, preferences, skills, patterns, and facts about a user';
COMMENT ON TABLE brain_edges IS 'Connections between brain nodes with relationship types and strength';
COMMENT ON TABLE brain_snapshots IS 'Temporal snapshots of the brain state for evolution tracking and time-travel queries';
COMMENT ON TABLE brain_activity_log IS 'Activity log tracking all changes to the brain for debugging and evolution analysis';

COMMENT ON COLUMN brain_nodes.confidence IS 'How certain we are about this node (0.0-1.0)';
COMMENT ON COLUMN brain_nodes.strength IS 'How strongly this attribute is expressed (0.0-1.0)';
COMMENT ON COLUMN brain_nodes.source_type IS 'Origin of this node: moltbot_episodic, moltbot_semantic, behavioral_pattern, claude_conversation, platform_data, manual';
COMMENT ON COLUMN brain_edges.relationship_type IS 'Type of connection: correlates_with, leads_to, evolved_from, contradicts, reinforces, context_specific, similar_to, requires';
COMMENT ON COLUMN brain_edges.evidence IS 'JSON array of supporting data points for this connection';
