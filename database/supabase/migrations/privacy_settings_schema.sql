-- Privacy Settings Schema
-- Comprehensive privacy control system for Twin AI Learn platform

-- =======================
-- PRIVACY SETTINGS TABLE
-- =======================
-- Stores user's privacy configuration including global settings and cluster-specific controls
CREATE TABLE IF NOT EXISTS privacy_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Global privacy level (0-100)
    global_privacy INTEGER NOT NULL DEFAULT 50 CHECK (global_privacy >= 0 AND global_privacy <= 100),

    -- Currently selected audience configuration
    selected_audience_id TEXT NOT NULL DEFAULT 'social',

    -- Currently applied template (if any)
    selected_template_id UUID REFERENCES privacy_templates(id) ON DELETE SET NULL,

    -- Life cluster configurations (JSONB array)
    -- Structure: [{ id, name, category, privacyLevel, enabled, subclusters: [...] }]
    clusters JSONB DEFAULT '[]'::jsonb,

    -- Audience-specific privacy overrides
    -- Structure: { audienceId: { clusterId: privacyLevel } }
    audience_specific_settings JSONB DEFAULT '{}'::jsonb,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one settings record per user
    UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_privacy_settings_user_id ON privacy_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_settings_template ON privacy_settings(selected_template_id);

-- Enable RLS (Row Level Security)
ALTER TABLE privacy_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own privacy settings"
    ON privacy_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own privacy settings"
    ON privacy_settings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own privacy settings"
    ON privacy_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own privacy settings"
    ON privacy_settings FOR DELETE
    USING (auth.uid() = user_id);


-- =======================
-- PRIVACY TEMPLATES TABLE
-- =======================
-- Stores both default and custom user-created privacy templates
CREATE TABLE IF NOT EXISTS privacy_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Template identification
    name TEXT NOT NULL,
    description TEXT,

    -- Template configuration
    -- Structure: { globalPrivacy: number, clusterSettings: { category: privacyLevel } }
    settings JSONB NOT NULL,

    -- Visual representation
    icon TEXT DEFAULT 'Shield',
    color TEXT DEFAULT '#8B5CF6',

    -- Template type
    is_default BOOLEAN DEFAULT FALSE,
    is_custom BOOLEAN DEFAULT TRUE,

    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_privacy_templates_user_id ON privacy_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_templates_default ON privacy_templates(is_default) WHERE is_default = TRUE;

-- Enable RLS
ALTER TABLE privacy_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view default templates and their own custom templates"
    ON privacy_templates FOR SELECT
    USING (is_default = TRUE OR auth.uid() = user_id);

CREATE POLICY "Users can create their own templates"
    ON privacy_templates FOR INSERT
    WITH CHECK (auth.uid() = user_id AND is_custom = TRUE);

CREATE POLICY "Users can update their own custom templates"
    ON privacy_templates FOR UPDATE
    USING (auth.uid() = user_id AND is_custom = TRUE);

CREATE POLICY "Users can delete their own custom templates"
    ON privacy_templates FOR DELETE
    USING (auth.uid() = user_id AND is_custom = TRUE);


-- =======================
-- PRIVACY AUDIT LOG TABLE
-- =======================
-- Tracks all privacy setting changes for transparency and debugging
CREATE TABLE IF NOT EXISTS privacy_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Change details
    action TEXT NOT NULL,
    previous_global_privacy INTEGER,
    new_global_privacy INTEGER,

    -- Cluster-specific changes (JSONB)
    cluster_changes JSONB,

    -- Additional context
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamp
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_user_id ON privacy_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_changed_at ON privacy_audit_log(changed_at DESC);

-- Enable RLS
ALTER TABLE privacy_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own audit log"
    ON privacy_audit_log FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can insert audit log entries"
    ON privacy_audit_log FOR INSERT
    WITH CHECK (TRUE);  -- Allow service role to insert


-- =======================
-- AUDIENCE CONFIGURATIONS
-- =======================
-- Stores custom audience configurations (optional - for advanced users)
CREATE TABLE IF NOT EXISTS audience_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Audience details
    name TEXT NOT NULL,
    description TEXT,

    -- Default privacy level for this audience
    default_privacy_level INTEGER NOT NULL DEFAULT 50 CHECK (default_privacy_level >= 0 AND default_privacy_level <= 100),

    -- Cluster-specific overrides for this audience
    cluster_overrides JSONB DEFAULT '{}'::jsonb,

    -- Visual
    icon TEXT DEFAULT 'Users',
    color TEXT DEFAULT '#8B5CF6',

    -- Metadata
    is_custom BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audience_configurations_user_id ON audience_configurations(user_id);

-- Enable RLS
ALTER TABLE audience_configurations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own audience configurations"
    ON audience_configurations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own audience configurations"
    ON audience_configurations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own audience configurations"
    ON audience_configurations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own audience configurations"
    ON audience_configurations FOR DELETE
    USING (auth.uid() = user_id);


-- =======================
-- DEFAULT TEMPLATES
-- =======================
-- Insert default privacy templates (system-wide)
INSERT INTO privacy_templates (name, description, settings, icon, color, is_default, is_custom, user_id) VALUES
    (
        'Maximum Privacy',
        'Hide everything - complete lockdown mode',
        '{"globalPrivacy": 0, "clusterSettings": {"personal": 0, "professional": 0, "creative": 0}}'::jsonb,
        'Lock',
        '#6B7280',
        TRUE,
        FALSE,
        NULL
    ),
    (
        'Professional Only',
        'Share career and skills, hide personal life',
        '{"globalPrivacy": 50, "clusterSettings": {"personal": 20, "professional": 85, "creative": 40}}'::jsonb,
        'Briefcase',
        '#3B82F6',
        TRUE,
        FALSE,
        NULL
    ),
    (
        'Social Butterfly',
        'Share interests and hobbies, protect work details',
        '{"globalPrivacy": 60, "clusterSettings": {"personal": 80, "professional": 30, "creative": 75}}'::jsonb,
        'Users',
        '#8B5CF6',
        TRUE,
        FALSE,
        NULL
    ),
    (
        'Balanced Sharing',
        'Moderate visibility across all areas',
        '{"globalPrivacy": 50, "clusterSettings": {"personal": 50, "professional": 50, "creative": 50}}'::jsonb,
        'Shield',
        '#F59E0B',
        TRUE,
        FALSE,
        NULL
    ),
    (
        'Full Transparency',
        'Share everything - maximum openness',
        '{"globalPrivacy": 100, "clusterSettings": {"personal": 100, "professional": 100, "creative": 100}}'::jsonb,
        'Globe',
        '#10B981',
        TRUE,
        FALSE,
        NULL
    ),
    (
        'Dating Profile',
        'Showcase personality, hide work specifics',
        '{"globalPrivacy": 65, "clusterSettings": {"personal": 85, "professional": 25, "creative": 80}}'::jsonb,
        'Heart',
        '#EC4899',
        TRUE,
        FALSE,
        NULL
    )
ON CONFLICT DO NOTHING;


-- =======================
-- UTILITY FUNCTIONS
-- =======================

-- Function to get effective privacy level for a cluster considering audience
CREATE OR REPLACE FUNCTION get_effective_privacy_level(
    p_user_id UUID,
    p_cluster_id TEXT,
    p_audience_id TEXT
) RETURNS INTEGER AS $$
DECLARE
    v_cluster_privacy INTEGER;
    v_audience_override INTEGER;
BEGIN
    -- Get base cluster privacy level
    SELECT (cluster->>'privacyLevel')::INTEGER
    INTO v_cluster_privacy
    FROM privacy_settings,
         jsonb_array_elements(clusters) AS cluster
    WHERE user_id = p_user_id
      AND cluster->>'id' = p_cluster_id;

    -- Check for audience-specific override
    SELECT (audience_specific_settings->p_audience_id->>p_cluster_id)::INTEGER
    INTO v_audience_override
    FROM privacy_settings
    WHERE user_id = p_user_id;

    -- Return override if exists, otherwise base level
    RETURN COALESCE(v_audience_override, v_cluster_privacy, 50);
END;
$$ LANGUAGE plpgsql;


-- Function to check if data should be revealed based on privacy settings
CREATE OR REPLACE FUNCTION should_reveal_data(
    p_user_id UUID,
    p_cluster_id TEXT,
    p_data_sensitivity INTEGER,
    p_audience_id TEXT DEFAULT 'social'
) RETURNS BOOLEAN AS $$
DECLARE
    v_privacy_level INTEGER;
BEGIN
    -- Get effective privacy level
    v_privacy_level := get_effective_privacy_level(p_user_id, p_cluster_id, p_audience_id);

    -- Reveal if privacy level is greater than or equal to data sensitivity
    RETURN v_privacy_level >= p_data_sensitivity;
END;
$$ LANGUAGE plpgsql;


-- =======================
-- TRIGGERS
-- =======================

-- Update updated_at timestamp on privacy_settings changes
CREATE OR REPLACE FUNCTION update_privacy_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER privacy_settings_updated_at
    BEFORE UPDATE ON privacy_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_privacy_settings_timestamp();


-- Audit log trigger for privacy changes
CREATE OR REPLACE FUNCTION log_privacy_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log actual changes
    IF (OLD.global_privacy != NEW.global_privacy) OR (OLD.clusters::text != NEW.clusters::text) THEN
        INSERT INTO privacy_audit_log (
            user_id,
            action,
            previous_global_privacy,
            new_global_privacy,
            cluster_changes,
            changed_at
        ) VALUES (
            NEW.user_id,
            'settings_updated',
            OLD.global_privacy,
            NEW.global_privacy,
            jsonb_build_object(
                'previous', OLD.clusters,
                'new', NEW.clusters
            ),
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER privacy_settings_audit
    AFTER UPDATE ON privacy_settings
    FOR EACH ROW
    EXECUTE FUNCTION log_privacy_change();


-- =======================
-- COMMENTS
-- =======================

COMMENT ON TABLE privacy_settings IS 'User privacy configuration including global settings and life cluster controls';
COMMENT ON TABLE privacy_templates IS 'Reusable privacy configuration templates (default and custom)';
COMMENT ON TABLE privacy_audit_log IS 'Audit trail of all privacy setting changes';
COMMENT ON TABLE audience_configurations IS 'Custom audience configurations for context-specific sharing';

COMMENT ON FUNCTION get_effective_privacy_level IS 'Calculate effective privacy level considering audience-specific overrides';
COMMENT ON FUNCTION should_reveal_data IS 'Determine if data should be revealed based on privacy settings and sensitivity';
