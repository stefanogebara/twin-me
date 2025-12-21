/**
 * Privacy System TypeScript Types
 *
 * Comprehensive type definitions for the Soul Signature privacy system including
 * contextual twins, cluster settings, and audience-specific privacy controls.
 */

// =======================
// CORE TYPES
// =======================

export type PrivacyLevel = number; // 0-100 scale

export type AudienceMode = 'everyone' | 'professional' | 'friends' | 'intimate' | 'dating';

export type ClusterCategory = 'personal' | 'professional' | 'creative';

export type TwinType = 'professional' | 'social' | 'dating' | 'public' | 'custom';

// =======================
// CLUSTER TYPES
// =======================

export interface Subcluster {
  id: string;
  name: string;
  description?: string;
  defaultSensitivity: number;
}

export interface ClusterDefinition {
  id: string;
  name: string;
  category: ClusterCategory;
  description?: string;
  default_sensitivity: number;
  icon: string;
  color?: string;
  sort_order: number;
  is_system_cluster: boolean;
  subclusters: Subcluster[];
  created_at: string;
  updated_at: string;
}

export interface SubclusterSetting {
  privacyLevel: number;
  enabled: boolean;
}

export interface ClusterSetting {
  privacyLevel: number;
  enabled: boolean;
  subclusterSettings?: Record<string, SubclusterSetting>;
}

export interface UserClusterSettings {
  id: string;
  user_id: string;
  cluster_id: string;
  privacy_level: number;
  is_enabled: boolean;
  custom_sensitivity?: number;
  subcluster_settings: Record<string, SubclusterSetting>;
  created_at: string;
  updated_at: string;
}

// =======================
// CONTEXTUAL TWIN TYPES
// =======================

export interface ContextualTwin {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  twin_type: TwinType;
  cluster_settings: Record<string, ClusterSetting>;
  global_privacy_override?: number;
  is_active: boolean;
  avatar_url?: string;
  color: string;
  icon: string;
  last_activated_at?: string;
  activation_count: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateContextualTwinInput {
  name: string;
  description?: string;
  twin_type: TwinType;
  cluster_settings: Record<string, ClusterSetting>;
  global_privacy_override?: number;
  avatar_url?: string;
  color?: string;
  icon?: string;
}

export interface UpdateContextualTwinInput {
  name?: string;
  description?: string;
  twin_type?: TwinType;
  cluster_settings?: Record<string, ClusterSetting>;
  global_privacy_override?: number;
  is_active?: boolean;
  avatar_url?: string;
  color?: string;
  icon?: string;
}

// =======================
// PRIVACY SETTINGS TYPES
// =======================

export interface PrivacySettings {
  id: string;
  user_id: string;
  global_privacy: number;
  selected_audience_id: string;
  selected_template_id?: string;
  active_twin_id?: string;
  clusters: ClusterData[];
  audience_specific_settings: Record<string, Record<string, number>>;
  twin_history: TwinActivationHistory[];
  created_at: string;
  updated_at: string;
}

export interface ClusterData {
  id: string;
  name: string;
  category: ClusterCategory;
  intensity: number; // 0-100 (data richness)
  privacyLevel: number; // 0-100 (visibility level)
  enabled: boolean;
  subclusters?: ClusterData[];
}

export interface TwinActivationHistory {
  twin_id: string;
  twin_name: string;
  activated_at: string;
  duration_seconds?: number;
}

export interface UpdatePrivacySettingsInput {
  global_privacy?: number;
  selected_audience_id?: string;
  selected_template_id?: string;
  clusters?: ClusterData[];
  audience_specific_settings?: Record<string, Record<string, number>>;
}

// =======================
// AUDIENCE PRESET TYPES
// =======================

export interface AudiencePreset {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  preset_key?: string;
  default_cluster_levels: Record<string, number>;
  global_privacy: number;
  icon: string;
  color: string;
  is_system_preset: boolean;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAudiencePresetInput {
  name: string;
  description?: string;
  default_cluster_levels: Record<string, number>;
  global_privacy?: number;
  icon?: string;
  color?: string;
}

// =======================
// PRIVACY TEMPLATE TYPES
// =======================

export interface PrivacyTemplate {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  settings: {
    globalPrivacy: number;
    clusterSettings: Record<string, number>;
  };
  icon: string;
  color: string;
  is_default: boolean;
  is_custom: boolean;
  usage_count: number;
  last_used?: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePrivacyTemplateInput {
  name: string;
  description?: string;
  settings: {
    globalPrivacy: number;
    clusterSettings: Record<string, number>;
  };
  icon?: string;
  color?: string;
}

// =======================
// AUDIT LOG TYPES
// =======================

export interface PrivacyAuditLog {
  id: string;
  user_id: string;
  action: PrivacyAuditAction;
  previous_global_privacy?: number;
  new_global_privacy?: number;
  cluster_changes?: {
    previous: Record<string, any>;
    new: Record<string, any>;
  };
  metadata: Record<string, any>;
  changed_at: string;
}

export type PrivacyAuditAction =
  | 'settings_updated'
  | 'twin_created'
  | 'twin_updated'
  | 'twin_deleted'
  | 'twin_activated'
  | 'template_applied'
  | 'preset_applied'
  | 'cluster_updated'
  | 'global_privacy_changed';

// =======================
// API RESPONSE TYPES
// =======================

export interface PrivacySettingsResponse {
  success: boolean;
  data?: PrivacySettings;
  error?: string;
}

export interface ContextualTwinsResponse {
  success: boolean;
  data?: ContextualTwin[];
  error?: string;
}

export interface ContextualTwinResponse {
  success: boolean;
  data?: ContextualTwin;
  error?: string;
}

export interface ClusterDefinitionsResponse {
  success: boolean;
  data?: ClusterDefinition[];
  error?: string;
}

export interface AudiencePresetsResponse {
  success: boolean;
  data?: AudiencePreset[];
  error?: string;
}

export interface PrivacyTemplatesResponse {
  success: boolean;
  data?: PrivacyTemplate[];
  error?: string;
}

export interface AuditLogResponse {
  success: boolean;
  data?: PrivacyAuditLog[];
  error?: string;
}

// =======================
// UTILITY TYPES
// =======================

export interface PrivacyValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface ClusterPrivacyMatrix {
  userId: string;
  twinId?: string;
  audienceId?: string;
  matrix: Record<string, {
    clusterId: string;
    clusterName: string;
    privacyLevel: number;
    enabled: boolean;
    effectiveLevel: number; // After applying twin/audience overrides
  }>;
}

export interface PrivacyStatistics {
  totalClusters: number;
  enabledClusters: number;
  averagePrivacyLevel: number;
  mostRestrictiveCluster: {
    clusterId: string;
    clusterName: string;
    privacyLevel: number;
  };
  leastRestrictiveCluster: {
    clusterId: string;
    clusterName: string;
    privacyLevel: number;
  };
  twinCount: number;
  activeTwinId?: string;
  lastUpdated: string;
}

// =======================
// HOOK TYPES (for React)
// =======================

export interface UsePrivacySettingsReturn {
  settings: PrivacySettings | null;
  loading: boolean;
  error: string | null;
  updateSettings: (input: UpdatePrivacySettingsInput) => Promise<void>;
  resetSettings: () => Promise<void>;
  applyTemplate: (templateId: string) => Promise<void>;
  applyPreset: (presetKey: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface UseContextualTwinsReturn {
  twins: ContextualTwin[];
  activeTwin: ContextualTwin | null;
  loading: boolean;
  error: string | null;
  createTwin: (input: CreateContextualTwinInput) => Promise<ContextualTwin>;
  updateTwin: (twinId: string, input: UpdateContextualTwinInput) => Promise<ContextualTwin>;
  deleteTwin: (twinId: string) => Promise<void>;
  activateTwin: (twinId: string) => Promise<void>;
  deactivateTwin: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface UseClusterSettingsReturn {
  clusters: ClusterDefinition[];
  userSettings: Record<string, UserClusterSettings>;
  loading: boolean;
  error: string | null;
  updateClusterPrivacy: (clusterId: string, privacyLevel: number) => Promise<void>;
  toggleCluster: (clusterId: string, enabled: boolean) => Promise<void>;
  updateSubclusterPrivacy: (clusterId: string, subclusterId: string, privacyLevel: number) => Promise<void>;
  resetClusterToDefault: (clusterId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// =======================
// CONSTANTS
// =======================

export const PRIVACY_LEVELS = {
  HIDDEN: 0,
  VERY_LOW: 20,
  LOW: 40,
  MEDIUM: 60,
  HIGH: 80,
  FULL: 100,
} as const;

export const DEFAULT_CLUSTER_COLORS: Record<ClusterCategory, string> = {
  personal: '#EC4899',
  professional: '#3B82F6',
  creative: '#8B5CF6',
};

export const DEFAULT_TWIN_COLORS: Record<TwinType, string> = {
  professional: '#3B82F6',
  social: '#10B981',
  dating: '#EC4899',
  public: '#6B7280',
  custom: '#8B5CF6',
};

export const DEFAULT_TWIN_ICONS: Record<TwinType, string> = {
  professional: 'Briefcase',
  social: 'Users',
  dating: 'Heart',
  public: 'Globe',
  custom: 'Sparkles',
};

// =======================
// VALIDATION SCHEMAS (for runtime validation)
// =======================

export const privacyLevelSchema = {
  type: 'number',
  minimum: 0,
  maximum: 100,
} as const;

export const clusterSettingSchema = {
  type: 'object',
  required: ['privacyLevel', 'enabled'],
  properties: {
    privacyLevel: privacyLevelSchema,
    enabled: { type: 'boolean' },
    subclusterSettings: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          privacyLevel: privacyLevelSchema,
          enabled: { type: 'boolean' },
        },
      },
    },
  },
} as const;

// =======================
// EXPORT ALL
// =======================

export type {
  // Re-export for convenience
  PrivacyLevel as Privacy,
  ClusterCategory as Category,
};
