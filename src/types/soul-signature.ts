/**
 * Soul Signature Platform - TypeScript Type Definitions
 *
 * These types match the Soul Signature database schema for type-safe
 * interactions with the Supabase database.
 */

// ====================================================================
// Big Five Personality Dimensions (OCEAN Model)
// ====================================================================

/**
 * Source type for personality score data
 */
export type PersonalityScoreSource = 'behavioral' | 'questionnaire' | 'hybrid';

/**
 * Big Five personality dimensions with confidence scores
 */
export interface PersonalityScores {
  id: string;
  user_id: string;

  // Big Five Dimensions (0-100 scale)
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;

  // Confidence scores for each dimension (0-100)
  openness_confidence: number;
  conscientiousness_confidence: number;
  extraversion_confidence: number;
  agreeableness_confidence: number;
  neuroticism_confidence: number;

  // Data source information
  source_type: PersonalityScoreSource;
  questionnaire_version?: string;

  // Statistical metadata
  sample_size: number;
  analyzed_platforms: string[];

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Input data for creating/updating personality scores
 */
export interface PersonalityScoresInput {
  user_id: string;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  openness_confidence?: number;
  conscientiousness_confidence?: number;
  extraversion_confidence?: number;
  agreeableness_confidence?: number;
  neuroticism_confidence?: number;
  source_type: PersonalityScoreSource;
  questionnaire_version?: string;
  sample_size?: number;
  analyzed_platforms?: string[];
}

// ====================================================================
// Soul Signature Archetypes
// ====================================================================

/**
 * Defining trait for a soul signature
 */
export interface DefiningTrait {
  trait: string;
  score: number;
  evidence: string;
}

/**
 * Color scheme for visual representation
 */
export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
}

/**
 * Soul Signature - unique personality archetype
 */
export interface SoulSignature {
  id: string;
  user_id: string;

  // Archetype identification
  archetype_name: string;
  archetype_subtitle?: string;

  // AI-generated narrative
  narrative: string;

  // Top defining characteristics
  defining_traits: DefiningTrait[];

  // Reference to personality scores
  personality_score_id?: string;

  // Visual representation
  color_scheme?: ColorScheme;
  icon_type?: string;

  // Privacy settings
  is_public: boolean;
  reveal_level: number; // 0-100

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Input data for creating/updating soul signatures
 */
export interface SoulSignatureInput {
  user_id: string;
  archetype_name: string;
  archetype_subtitle?: string;
  narrative: string;
  defining_traits?: DefiningTrait[];
  personality_score_id?: string;
  color_scheme?: ColorScheme;
  icon_type?: string;
  is_public?: boolean;
  reveal_level?: number;
}

// ====================================================================
// Behavioral Features
// ====================================================================

/**
 * Platform-specific behavioral feature
 */
export interface BehavioralFeature {
  id: string;
  user_id: string;

  // Platform identification
  platform: string;
  feature_type: string;

  // Feature values
  feature_value: number;
  normalized_value?: number; // 0-1 scale

  // Statistical metadata
  confidence_score: number; // 0-100
  sample_size: number;

  // Personality dimension contribution
  contributes_to?: string; // e.g., 'openness', 'conscientiousness'
  contribution_weight: number;

  // Supporting evidence
  evidence?: Record<string, any>;

  // Timestamps
  extracted_at: string;
  updated_at: string;
}

/**
 * Input data for creating/updating behavioral features
 */
export interface BehavioralFeatureInput {
  user_id: string;
  platform: string;
  feature_type: string;
  feature_value: number;
  normalized_value?: number;
  confidence_score?: number;
  sample_size?: number;
  contributes_to?: string;
  contribution_weight?: number;
  evidence?: Record<string, any>;
}

// ====================================================================
// Unique Patterns
// ====================================================================

/**
 * Pattern type classification
 */
export type PatternType = 'outlier_high' | 'outlier_low' | 'rare_combination';

/**
 * Unique behavioral pattern (top/bottom 5% behaviors)
 */
export interface UniquePattern {
  id: string;
  user_id: string;

  // Pattern identification
  pattern_type: PatternType;
  pattern_name: string;
  description: string;

  // Statistical context
  user_value: number;
  population_percentile?: number; // 0-100
  population_mean?: number;
  population_stddev?: number;

  // Cross-platform pattern
  platforms?: string[];
  behavioral_feature_ids?: string[];

  // Importance metrics
  uniqueness_score: number; // 0-100
  is_defining: boolean;

  // Supporting evidence
  evidence?: Record<string, any>;

  // Timestamps
  detected_at: string;
  updated_at: string;
}

/**
 * Input data for creating/updating unique patterns
 */
export interface UniquePatternInput {
  user_id: string;
  pattern_type: PatternType;
  pattern_name: string;
  description: string;
  user_value: number;
  population_percentile?: number;
  population_mean?: number;
  population_stddev?: number;
  platforms?: string[];
  behavioral_feature_ids?: string[];
  uniqueness_score?: number;
  is_defining?: boolean;
  evidence?: Record<string, any>;
}

// ====================================================================
// Privacy Settings
// ====================================================================

/**
 * Platform-specific privacy override
 */
export interface PlatformPrivacyOverride {
  reveal_level: number;
  hide_genres?: string[];
  hide_series?: boolean;
  [key: string]: any;
}

/**
 * Audience-specific privacy profile
 */
export interface AudienceProfile {
  audience: string;
  reveal_level: number;
  hide_clusters?: string[];
  show_clusters?: string[];
  [key: string]: any;
}

/**
 * Granular privacy controls for soul signature
 */
export interface PrivacySettings {
  id: string;
  user_id: string;

  // Global privacy level
  global_reveal_level: number; // 0-100

  // Personality dimension-specific controls
  openness_reveal: number;
  conscientiousness_reveal: number;
  extraversion_reveal: number;
  agreeableness_reveal: number;
  neuroticism_reveal: number;

  // Life cluster controls
  personal_clusters_reveal: number;
  professional_clusters_reveal: number;
  creative_clusters_reveal: number;

  // Platform-specific overrides
  platform_overrides: Record<string, PlatformPrivacyOverride>;

  // Audience-specific settings
  audience_profiles: AudienceProfile[];

  // Feature-specific hiding
  hidden_patterns?: string[];
  hidden_features?: string[];

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Input data for creating/updating privacy settings
 */
export interface PrivacySettingsInput {
  user_id: string;
  global_reveal_level?: number;
  openness_reveal?: number;
  conscientiousness_reveal?: number;
  extraversion_reveal?: number;
  agreeableness_reveal?: number;
  neuroticism_reveal?: number;
  personal_clusters_reveal?: number;
  professional_clusters_reveal?: number;
  creative_clusters_reveal?: number;
  platform_overrides?: Record<string, PlatformPrivacyOverride>;
  audience_profiles?: AudienceProfile[];
  hidden_patterns?: string[];
  hidden_features?: string[];
}

// ====================================================================
// Complete Soul Signature Profile (View)
// ====================================================================

/**
 * Complete soul signature profile combining all related data
 */
export interface SoulSignatureProfile {
  user_id: string;
  email: string;
  full_name?: string;

  // Soul signature archetype
  archetype_name?: string;
  archetype_subtitle?: string;
  narrative?: string;
  defining_traits?: DefiningTrait[];

  // Big Five dimensions
  openness?: number;
  conscientiousness?: number;
  extraversion?: number;
  agreeableness?: number;
  neuroticism?: number;

  // Confidence scores
  openness_confidence?: number;
  conscientiousness_confidence?: number;
  extraversion_confidence?: number;
  agreeableness_confidence?: number;
  neuroticism_confidence?: number;

  // Metadata
  source_type?: PersonalityScoreSource;
  analyzed_platforms?: string[];
  sample_size?: number;

  // Privacy settings
  global_reveal_level?: number;
  openness_reveal?: number;
  conscientiousness_reveal?: number;
  extraversion_reveal?: number;
  agreeableness_reveal?: number;
  neuroticism_reveal?: number;

  // Public visibility
  is_public?: boolean;

  // Timestamps
  soul_signature_created_at?: string;
  personality_last_updated?: string;
}

// ====================================================================
// API Response Types
// ====================================================================

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Personality analysis result
 */
export interface PersonalityAnalysisResult {
  personality_scores: PersonalityScores;
  soul_signature: SoulSignature;
  unique_patterns: UniquePattern[];
  confidence: number;
}

/**
 * Feature extraction progress
 */
export interface FeatureExtractionProgress {
  platform: string;
  status: 'pending' | 'extracting' | 'completed' | 'error';
  features_extracted: number;
  total_features: number;
  error?: string;
}

/**
 * Soul signature generation request
 */
export interface GenerateSoulSignatureRequest {
  user_id: string;
  platforms?: string[];
  force_refresh?: boolean;
}

/**
 * Privacy update request
 */
export interface UpdatePrivacyRequest {
  user_id: string;
  global_reveal_level?: number;
  dimension_reveals?: {
    openness?: number;
    conscientiousness?: number;
    extraversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  };
  cluster_reveals?: {
    personal?: number;
    professional?: number;
    creative?: number;
  };
  platform_overrides?: Record<string, PlatformPrivacyOverride>;
  audience_profiles?: AudienceProfile[];
}
