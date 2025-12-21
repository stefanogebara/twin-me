-- Contextual Twins Privacy Enhancement
-- Extends privacy system with contextual twin support for audience-specific data sharing

-- =======================
-- CONTEXTUAL TWINS TABLE
-- =======================
-- Stores user-created contextual twins (Professional, Social, Dating, Public, etc.)
CREATE TABLE IF NOT EXISTS contextual_twins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Twin identification
    name TEXT NOT NULL,
    description TEXT,

    -- Twin type/purpose
    twin_type TEXT NOT NULL, -- 'professional', 'social', 'dating', 'public', 'custom'

    -- Cluster-specific privacy levels for this twin
    -- Structure: { clusterId: { privacyLevel: number, enabled: boolean } }
    cluster_settings JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Global privacy level for this twin (overrides individual clusters if set)
    global_privacy_override INTEGER CHECK (global_privacy_override >= 0 AND global_privacy_override <= 100),

    -- Twin activation status
    is_active BOOLEAN DEFAULT true,

    -- Visual representation
    avatar_url TEXT,
    color TEXT DEFAULT '#8B5CF6',
    icon TEXT DEFAULT 'User',

    -- Usage tracking
    last_activated_at TIMESTAMPTZ,
    activation_count INTEGER DEFAULT 0,

    -- Metadata
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique names per user
    UNIQUE(user_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contextual_twins_user_id ON contextual_twins(user_id);
CREATE INDEX IF NOT EXISTS idx_contextual_twins_type ON contextual_twins(twin_type);
CREATE INDEX IF NOT EXISTS idx_contextual_twins_active ON contextual_twins(user_id, is_active) WHERE is_active = true;

-- Enable RLS (Row Level Security)
ALTER TABLE contextual_twins ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own contextual twins"
    ON contextual_twins FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own contextual twins"
    ON contextual_twins FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contextual twins"
    ON contextual_twins FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contextual twins"
    ON contextual_twins FOR DELETE
    USING (auth.uid() = user_id);


-- =======================
-- CLUSTER DEFINITIONS TABLE
-- =======================
-- Stores the life cluster definitions (categories) used across the platform
CREATE TABLE IF NOT EXISTS cluster_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'personal', 'professional', 'creative', etc.
    description TEXT,

    -- Default sensitivity level for this cluster (0-100)
    default_sensitivity INTEGER DEFAULT 50 CHECK (default_sensitivity >= 0 AND default_sensitivity <= 100),

    -- Visual representation
    icon TEXT DEFAULT 'Folder',
    color TEXT,

    -- Ordering and grouping
    sort_order INTEGER DEFAULT 0,
    is_system_cluster BOOLEAN DEFAULT true,

    -- Subclusters (optional)
    -- Structure: [{ id, name, description, defaultSensitivity }]
    subclusters JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cluster_definitions ENABLE ROW LEVEL SECURITY;

-- Public read access to cluster definitions
CREATE POLICY "Anyone can view cluster definitions"
    ON cluster_definitions FOR SELECT
    USING (true);


-- =======================
-- USER CLUSTER SETTINGS TABLE
-- =======================
-- Stores user-specific overrides for cluster privacy levels
CREATE TABLE IF NOT EXISTS user_cluster_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cluster_id TEXT NOT NULL REFERENCES cluster_definitions(id) ON DELETE CASCADE,

    -- Privacy level for this cluster (0-100)
    privacy_level INTEGER NOT NULL DEFAULT 50 CHECK (privacy_level >= 0 AND privacy_level <= 100),

    -- Whether this cluster is enabled/visible
    is_enabled BOOLEAN DEFAULT true,

    -- Custom sensitivity level (user override of default)
    custom_sensitivity INTEGER CHECK (custom_sensitivity >= 0 AND custom_sensitivity <= 100),

    -- Subcluster-specific settings
    -- Structure: { subclusterId: { privacyLevel: number, enabled: boolean } }
    subcluster_settings JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one setting per user per cluster
    UNIQUE(user_id, cluster_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_cluster_settings_user ON user_cluster_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cluster_settings_cluster ON user_cluster_settings(cluster_id);
CREATE INDEX IF NOT EXISTS idx_user_cluster_settings_user_cluster ON user_cluster_settings(user_id, cluster_id);

-- Enable RLS
ALTER TABLE user_cluster_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own cluster settings"
    ON user_cluster_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own cluster settings"
    ON user_cluster_settings FOR ALL
    USING (auth.uid() = user_id);


-- =======================
-- AUDIENCE PRESETS TABLE
-- =======================
-- Stores preset audience configurations (system and user-created)
CREATE TABLE IF NOT EXISTS audience_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Preset identification
    name TEXT NOT NULL,
    description TEXT,
    preset_key TEXT UNIQUE, -- e.g., 'everyone', 'professional', 'friends', 'intimate'

    -- Default cluster privacy levels for this audience
    -- Structure: { clusterId: privacyLevel }
    default_cluster_levels JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Global privacy level for this audience
    global_privacy INTEGER DEFAULT 50 CHECK (global_privacy >= 0 AND global_privacy <= 100),

    -- Visual representation
    icon TEXT DEFAULT 'Users',
    color TEXT DEFAULT '#8B5CF6',

    -- Preset type
    is_system_preset BOOLEAN DEFAULT false,
    is_custom BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audience_presets_user ON audience_presets(user_id);
CREATE INDEX IF NOT EXISTS idx_audience_presets_key ON audience_presets(preset_key);
CREATE INDEX IF NOT EXISTS idx_audience_presets_system ON audience_presets(is_system_preset) WHERE is_system_preset = true;

-- Enable RLS
ALTER TABLE audience_presets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view system presets and their own custom presets"
    ON audience_presets FOR SELECT
    USING (is_system_preset = true OR auth.uid() = user_id);

CREATE POLICY "Users can create their own presets"
    ON audience_presets FOR INSERT
    WITH CHECK (auth.uid() = user_id AND is_custom = true);

CREATE POLICY "Users can update their own custom presets"
    ON audience_presets FOR UPDATE
    USING (auth.uid() = user_id AND is_custom = true);

CREATE POLICY "Users can delete their own custom presets"
    ON audience_presets FOR DELETE
    USING (auth.uid() = user_id AND is_custom = true);


-- =======================
-- EXTEND PRIVACY SETTINGS
-- =======================
-- Add columns to existing privacy_settings table for contextual twin support
DO $$
BEGIN
    -- Add active_twin_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'privacy_settings' AND column_name = 'active_twin_id'
    ) THEN
        ALTER TABLE privacy_settings
        ADD COLUMN active_twin_id UUID REFERENCES contextual_twins(id) ON DELETE SET NULL;
    END IF;

    -- Add twin_history if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'privacy_settings' AND column_name = 'twin_history'
    ) THEN
        ALTER TABLE privacy_settings
        ADD COLUMN twin_history JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Create index for active twin lookup
CREATE INDEX IF NOT EXISTS idx_privacy_settings_active_twin ON privacy_settings(active_twin_id);


-- =======================
-- DEFAULT CLUSTER DEFINITIONS
-- =======================
-- Insert default life clusters
INSERT INTO cluster_definitions (id, name, category, description, default_sensitivity, icon, color, sort_order) VALUES
    -- Personal Clusters
    ('hobbies', 'Hobbies & Interests', 'personal', 'Your recreational activities and personal interests', 60, 'Heart', '#EC4899', 1),
    ('sports', 'Sports & Fitness', 'personal', 'Your physical activities and fitness routines', 55, 'Dumbbell', '#F59E0B', 2),
    ('spirituality', 'Spirituality & Religion', 'personal', 'Your spiritual beliefs and religious practices', 70, 'Sparkles', '#8B5CF6', 3),
    ('entertainment', 'Entertainment Choices', 'personal', 'Your movies, shows, music, and media preferences', 50, 'Film', '#3B82F6', 4),
    ('social', 'Social Connections', 'personal', 'Your friendships and social network', 65, 'Users', '#10B981', 5),
    ('travel', 'Travel & Experiences', 'personal', 'Your travel history and adventure preferences', 55, 'Plane', '#6366F1', 6),
    ('food', 'Food & Dining', 'personal', 'Your culinary preferences and dietary choices', 45, 'UtensilsCrossed', '#EF4444', 7),

    -- Professional Clusters
    ('education', 'Studies & Education', 'professional', 'Your academic background and certifications', 40, 'GraduationCap', '#3B82F6', 10),
    ('career', 'Career & Jobs', 'professional', 'Your work history and current employment', 45, 'Briefcase', '#1F2937', 11),
    ('skills', 'Skills & Expertise', 'professional', 'Your technical and professional competencies', 35, 'Award', '#F59E0B', 12),
    ('achievements', 'Achievements & Recognition', 'professional', 'Your awards, publications, and accomplishments', 40, 'Trophy', '#FBBF24', 13),
    ('networking', 'Professional Network', 'professional', 'Your professional connections and associations', 50, 'Network', '#6B7280', 14),

    -- Creative Clusters
    ('artistic', 'Artistic Expression', 'creative', 'Your artistic pursuits and creative projects', 60, 'Palette', '#EC4899', 20),
    ('content', 'Content Creation', 'creative', 'Your blogs, videos, and digital content', 55, 'Video', '#EF4444', 21),
    ('music', 'Musical Identity', 'creative', 'Your musical tastes and creative expression', 50, 'Music', '#8B5CF6', 22),
    ('writing', 'Writing & Literature', 'creative', 'Your reading habits and literary preferences', 55, 'BookOpen', '#10B981', 23)
ON CONFLICT (id) DO NOTHING;


-- =======================
-- DEFAULT AUDIENCE PRESETS
-- =======================
-- Insert default audience presets (system-wide)
INSERT INTO audience_presets (name, description, preset_key, default_cluster_levels, global_privacy, icon, color, is_system_preset, is_custom, user_id) VALUES
    (
        'Everyone',
        'Public information safe for anyone to see',
        'everyone',
        '{"hobbies": 30, "sports": 25, "spirituality": 10, "entertainment": 35, "social": 20, "travel": 40, "food": 30, "education": 50, "career": 45, "skills": 60, "achievements": 70, "networking": 40, "artistic": 40, "content": 50, "music": 35, "writing": 45}'::jsonb,
        40,
        'Globe',
        '#6B7280',
        TRUE,
        FALSE,
        NULL
    ),
    (
        'Professional',
        'Career-focused, suitable for colleagues and recruiters',
        'professional',
        '{"hobbies": 20, "sports": 15, "spirituality": 5, "entertainment": 10, "social": 15, "travel": 25, "food": 10, "education": 90, "career": 85, "skills": 95, "achievements": 95, "networking": 80, "artistic": 30, "content": 40, "music": 15, "writing": 35}'::jsonb,
        60,
        'Briefcase',
        '#3B82F6',
        TRUE,
        FALSE,
        NULL
    ),
    (
        'Friends',
        'Personal information for close friends',
        'friends',
        '{"hobbies": 85, "sports": 80, "spirituality": 50, "entertainment": 90, "social": 95, "travel": 85, "food": 80, "education": 60, "career": 55, "skills": 50, "achievements": 60, "networking": 40, "artistic": 85, "content": 80, "music": 90, "writing": 75}'::jsonb,
        80,
        'Users',
        '#10B981',
        TRUE,
        FALSE,
        NULL
    ),
    (
        'Intimate',
        'Full transparency for very close relationships',
        'intimate',
        '{"hobbies": 100, "sports": 100, "spirituality": 100, "entertainment": 100, "social": 100, "travel": 100, "food": 100, "education": 100, "career": 100, "skills": 100, "achievements": 100, "networking": 100, "artistic": 100, "content": 100, "music": 100, "writing": 100}'::jsonb,
        100,
        'Heart',
        '#EC4899',
        TRUE,
        FALSE,
        NULL
    ),
    (
        'Dating',
        'Showcase personality while maintaining privacy',
        'dating',
        '{"hobbies": 90, "sports": 85, "spirituality": 60, "entertainment": 95, "social": 70, "travel": 90, "food": 85, "education": 65, "career": 50, "skills": 45, "achievements": 55, "networking": 25, "artistic": 90, "content": 75, "music": 95, "writing": 80}'::jsonb,
        75,
        'Sparkles',
        '#F59E0B',
        TRUE,
        FALSE,
        NULL
    )
ON CONFLICT (preset_key) DO NOTHING;


-- =======================
-- DEFAULT CONTEXTUAL TWINS
-- =======================
-- Function to create default contextual twins for new users
CREATE OR REPLACE FUNCTION create_default_contextual_twins(p_user_id UUID)
RETURNS void AS $$
BEGIN
    -- Professional Twin
    INSERT INTO contextual_twins (user_id, name, description, twin_type, cluster_settings, color, icon, is_default)
    VALUES (
        p_user_id,
        'Professional',
        'Your work persona - optimized for career networking and opportunities',
        'professional',
        '{"education": {"privacyLevel": 90, "enabled": true}, "career": {"privacyLevel": 85, "enabled": true}, "skills": {"privacyLevel": 95, "enabled": true}, "achievements": {"privacyLevel": 95, "enabled": true}, "networking": {"privacyLevel": 80, "enabled": true}, "hobbies": {"privacyLevel": 20, "enabled": false}, "spirituality": {"privacyLevel": 5, "enabled": false}}'::jsonb,
        '#3B82F6',
        'Briefcase',
        true
    );

    -- Social Twin
    INSERT INTO contextual_twins (user_id, name, description, twin_type, cluster_settings, color, icon, is_default)
    VALUES (
        p_user_id,
        'Social',
        'Your social persona - share interests and hobbies with friends',
        'social',
        '{"hobbies": {"privacyLevel": 85, "enabled": true}, "entertainment": {"privacyLevel": 90, "enabled": true}, "social": {"privacyLevel": 95, "enabled": true}, "travel": {"privacyLevel": 85, "enabled": true}, "music": {"privacyLevel": 90, "enabled": true}, "career": {"privacyLevel": 40, "enabled": false}, "networking": {"privacyLevel": 30, "enabled": false}}'::jsonb,
        '#10B981',
        'Users',
        true
    );

    -- Dating Twin
    INSERT INTO contextual_twins (user_id, name, description, twin_type, cluster_settings, color, icon, is_default)
    VALUES (
        p_user_id,
        'Dating',
        'Your authentic self - showcase personality and interests',
        'dating',
        '{"hobbies": {"privacyLevel": 90, "enabled": true}, "entertainment": {"privacyLevel": 95, "enabled": true}, "travel": {"privacyLevel": 90, "enabled": true}, "food": {"privacyLevel": 85, "enabled": true}, "music": {"privacyLevel": 95, "enabled": true}, "artistic": {"privacyLevel": 90, "enabled": true}, "career": {"privacyLevel": 50, "enabled": true}, "education": {"privacyLevel": 65, "enabled": true}}'::jsonb,
        '#EC4899',
        'Heart',
        true
    );

    -- Public Twin
    INSERT INTO contextual_twins (user_id, name, description, twin_type, cluster_settings, color, icon, is_default)
    VALUES (
        p_user_id,
        'Public',
        'Your public persona - safe for anyone to see',
        'public',
        '{"skills": {"privacyLevel": 60, "enabled": true}, "achievements": {"privacyLevel": 70, "enabled": true}, "content": {"privacyLevel": 50, "enabled": true}, "education": {"privacyLevel": 50, "enabled": true}, "hobbies": {"privacyLevel": 30, "enabled": true}}'::jsonb,
        '#6B7280',
        'Globe',
        true
    );
END;
$$ LANGUAGE plpgsql;


-- =======================
-- UTILITY FUNCTIONS
-- =======================

-- Function to get effective privacy level for a cluster in a contextual twin context
CREATE OR REPLACE FUNCTION get_twin_cluster_privacy(
    p_twin_id UUID,
    p_cluster_id TEXT
) RETURNS INTEGER AS $$
DECLARE
    v_privacy_level INTEGER;
    v_global_override INTEGER;
BEGIN
    -- Get twin's global privacy override
    SELECT global_privacy_override INTO v_global_override
    FROM contextual_twins
    WHERE id = p_twin_id;

    -- Return global override if set
    IF v_global_override IS NOT NULL THEN
        RETURN v_global_override;
    END IF;

    -- Get cluster-specific setting
    SELECT (cluster_settings->p_cluster_id->>'privacyLevel')::INTEGER
    INTO v_privacy_level
    FROM contextual_twins
    WHERE id = p_twin_id;

    -- Return cluster setting or default to 50
    RETURN COALESCE(v_privacy_level, 50);
END;
$$ LANGUAGE plpgsql;


-- Function to check if cluster is enabled in contextual twin
CREATE OR REPLACE FUNCTION is_cluster_enabled_in_twin(
    p_twin_id UUID,
    p_cluster_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_enabled BOOLEAN;
BEGIN
    SELECT COALESCE((cluster_settings->p_cluster_id->>'enabled')::BOOLEAN, true)
    INTO v_enabled
    FROM contextual_twins
    WHERE id = p_twin_id;

    RETURN COALESCE(v_enabled, true);
END;
$$ LANGUAGE plpgsql;


-- Function to apply contextual twin settings to user's privacy settings
CREATE OR REPLACE FUNCTION apply_contextual_twin(
    p_user_id UUID,
    p_twin_id UUID
) RETURNS void AS $$
DECLARE
    v_cluster_settings JSONB;
    v_twin_type TEXT;
BEGIN
    -- Get twin settings
    SELECT cluster_settings, twin_type
    INTO v_cluster_settings, v_twin_type
    FROM contextual_twins
    WHERE id = p_twin_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contextual twin not found or does not belong to user';
    END IF;

    -- Update privacy settings with twin configuration
    UPDATE privacy_settings
    SET
        active_twin_id = p_twin_id,
        selected_audience_id = v_twin_type,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Update twin activation tracking
    UPDATE contextual_twins
    SET
        last_activated_at = NOW(),
        activation_count = activation_count + 1
    WHERE id = p_twin_id;

    -- Log the twin activation
    INSERT INTO privacy_audit_log (user_id, action, metadata)
    VALUES (
        p_user_id,
        'twin_activated',
        jsonb_build_object(
            'twin_id', p_twin_id,
            'twin_type', v_twin_type,
            'timestamp', NOW()
        )
    );
END;
$$ LANGUAGE plpgsql;


-- =======================
-- TRIGGERS
-- =======================

-- Update timestamp on contextual_twins changes
CREATE OR REPLACE FUNCTION update_contextual_twins_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contextual_twins_updated_at
    BEFORE UPDATE ON contextual_twins
    FOR EACH ROW
    EXECUTE FUNCTION update_contextual_twins_timestamp();


-- Audit log trigger for contextual twin changes
CREATE OR REPLACE FUNCTION log_contextual_twin_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO privacy_audit_log (user_id, action, metadata)
        VALUES (NEW.user_id, 'twin_created', jsonb_build_object('twin_id', NEW.id, 'twin_name', NEW.name, 'twin_type', NEW.twin_type));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO privacy_audit_log (user_id, action, metadata)
        VALUES (NEW.user_id, 'twin_updated', jsonb_build_object('twin_id', NEW.id, 'twin_name', NEW.name, 'previous_settings', OLD.cluster_settings, 'new_settings', NEW.cluster_settings));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO privacy_audit_log (user_id, action, metadata)
        VALUES (OLD.user_id, 'twin_deleted', jsonb_build_object('twin_id', OLD.id, 'twin_name', OLD.name));
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contextual_twins_audit
    AFTER INSERT OR UPDATE OR DELETE ON contextual_twins
    FOR EACH ROW
    EXECUTE FUNCTION log_contextual_twin_change();


-- =======================
-- COMMENTS
-- =======================

COMMENT ON TABLE contextual_twins IS 'User-created contextual twins for audience-specific data sharing';
COMMENT ON TABLE cluster_definitions IS 'Life cluster definitions used across the platform';
COMMENT ON TABLE user_cluster_settings IS 'User-specific privacy settings for each life cluster';
COMMENT ON TABLE audience_presets IS 'Preset audience configurations (system and custom)';

COMMENT ON FUNCTION create_default_contextual_twins IS 'Create default contextual twins for new users';
COMMENT ON FUNCTION get_twin_cluster_privacy IS 'Get effective privacy level for a cluster in a contextual twin';
COMMENT ON FUNCTION is_cluster_enabled_in_twin IS 'Check if cluster is enabled in a contextual twin';
COMMENT ON FUNCTION apply_contextual_twin IS 'Apply contextual twin settings to user privacy settings';
