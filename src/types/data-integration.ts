/**
 * Twin AI Learn - Data Integration Types
 * Revolutionary Soul Signature extraction and analysis system
 */

// ====================================================================
// CORE DATA INTEGRATION TYPES
// ====================================================================

export type DataProvider =
  | 'google_gmail' | 'google_calendar' | 'google_drive'
  | 'microsoft_outlook' | 'microsoft_teams' | 'microsoft_onedrive'
  | 'slack' | 'discord' | 'linkedin' | 'twitter' | 'instagram'
  | 'netflix' | 'spotify' | 'youtube' | 'github' | 'notion' | 'reddit';

export type DataType =
  | 'email' | 'calendar_event' | 'slack_message' | 'teams_message'
  | 'document' | 'social_post' | 'media_consumption' | 'code_commit'
  | 'search_query' | 'location' | 'file_activity';

export type SyncStatus = 'pending' | 'success' | 'error' | 'rate_limited';

export interface DataConnector {
  id: string;
  userId: string;
  provider: DataProvider;

  // OAuth credentials (encrypted in database)
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;

  // Connection metadata
  connectedAt: Date;
  lastSync?: Date;
  syncFrequency: number; // minutes
  isActive: boolean;

  // User permissions
  permissions: Record<string, boolean>;

  // Performance metrics
  totalSynced: number;
  lastSyncStatus: SyncStatus;
  errorCount: number;
}

// ====================================================================
// RAW DATA PROCESSING
// ====================================================================

export interface RawDataPoint {
  id: string;
  userId: string;
  connectorId: string;
  dataType: DataType;

  // Content
  content: Record<string, any>;
  metadata: Record<string, any>;

  // Processing status
  processed: boolean;
  processingError?: string;
  qualityScore?: number; // 0-1

  // Temporal data
  sourceTimestamp: Date;
  ingestedAt: Date;
  processedAt?: Date;

  // Privacy
  sensitivityLevel: 'low' | 'medium' | 'high' | 'critical';
  retentionUntil?: Date;
}

// ====================================================================
// PERSONALITY ANALYSIS ENGINE
// ====================================================================

export type InsightType =
  | 'writing_style' | 'communication_pattern' | 'expertise_area' | 'interest'
  | 'social_behavior' | 'work_pattern' | 'decision_making' | 'emotional_tone'
  | 'response_timing' | 'collaboration_style' | 'learning_preference' | 'creativity_level';

export interface WritingStyle {
  tone: 'professional' | 'casual' | 'friendly' | 'authoritative' | 'humorous';
  formality: number; // 0-1 scale
  hasHumor: boolean;
  empathyLevel: number; // 0-1 scale
  directness: number; // 0-1 scale
  vocabulary: string[]; // commonly used words/phrases
  sentenceStructure: 'short' | 'medium' | 'complex';
  emojiUsage: number; // frequency 0-1
}

export interface CommunicationPattern {
  avgResponseTime: number; // minutes
  avgMessageLength: number; // characters
  questionFrequency: number; // tendency to ask questions
  supportiveness: number; // tendency to offer help
  initiationRate: number; // how often they start conversations
  preferredChannels: string[]; // email, slack, etc.
  activeHours: { start: number; end: number }; // 0-23
}

export interface ExpertiseArea {
  domain: string;
  confidenceLevel: number; // 0-1
  keywords: string[];
  context: 'work' | 'personal' | 'academic';
  recentActivity: number; // how actively engaged recently
  teachingAbility: number; // how well they explain this topic
}

export interface PersonalityInsight {
  id: string;
  userId: string;
  insightType: InsightType;
  insightData: WritingStyle | CommunicationPattern | ExpertiseArea | Record<string, any>;

  // Confidence and validation
  confidenceScore: number; // 0-1
  sourceDataCount: number;
  sourceDataIds: string[];

  // Temporal evolution
  validFrom: Date;
  validUntil?: Date;
  supersedesInsightId?: string;

  // Quality metadata
  analysisMethod: 'ai_analysis' | 'pattern_detection' | 'user_feedback';
  lastUpdated: Date;
  updateTrigger: 'new_data' | 'drift_detection' | 'user_correction';
}

// ====================================================================
// TWIN EVOLUTION TRACKING
// ====================================================================

export type ChangeType =
  | 'personality_update' | 'expertise_expansion' | 'style_drift' | 'new_interest'
  | 'behavior_pattern_change' | 'user_correction' | 'confidence_adjustment';

export interface TwinEvolutionEntry {
  id: string;
  twinId: string;
  userId: string;

  changeType: ChangeType;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  changeSummary: string;
  confidenceImpact: number; // -1 to 1

  triggerSource: 'data_analysis' | 'user_feedback' | 'drift_detection';
  sourceDataIds: string[];

  createdAt: Date;
  appliedAt?: Date;
  rolledBackAt?: Date; // if user disagreed
}

// ====================================================================
// SMART ACTIONS & AUTOMATION
// ====================================================================

export type AutomationRuleType =
  | 'auto_email_response' | 'social_post_draft' | 'calendar_management'
  | 'message_prioritization' | 'content_recommendation' | 'meeting_preparation';

export interface AutomationRule {
  id: string;
  userId: string;
  ruleName: string;
  ruleType: AutomationRuleType;

  // Rule logic
  conditions: Record<string, any>; // when to trigger
  actions: Record<string, any>; // what to do

  // Safety controls
  confidenceThreshold: number; // 0-1
  requiresApproval: boolean;
  maxDailyExecutions: number;

  // Performance
  executionsCount: number;
  successRate?: number;
  userSatisfactionScore?: number;

  isActive: boolean;
  createdAt: Date;
  lastTriggered?: Date;
}

// ====================================================================
// DATA QUALITY & METRICS
// ====================================================================

export interface DataQualityMetrics {
  id: string;
  userId: string;
  connectorId: string;
  metricDate: Date;

  // Volume metrics
  totalDataPoints: number;
  processedSuccessfully: number;
  processingErrors: number;
  duplicateDataPoints: number;

  // Quality scores
  avgContentQuality: number; // 0-1
  signalToNoiseRatio: number; // 0-1

  // Performance
  avgProcessingTimeMs: number;
  apiRateLimitHits: number;

  // Insights
  insightsGenerated: number;
  insightConfidenceAvg: number;
}

// ====================================================================
// REAL-TIME SYNC SYSTEM
// ====================================================================

export type QueueType =
  | 'initial_sync' | 'incremental_sync' | 'webhook_event' | 'manual_refresh'
  | 'error_retry' | 'drift_analysis' | 'insight_recompute';

export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SyncQueueItem {
  id: string;
  userId: string;
  connectorId: string;
  queueType: QueueType;

  priority: number; // 1-10 (1 = highest)
  payload?: Record<string, any>;

  status: QueueStatus;
  attempts: number;
  maxAttempts: number;

  createdAt: Date;
  scheduledFor: Date;
  startedAt?: Date;
  completedAt?: Date;

  errorMessage?: string;
  retryAfter?: Date;
}

// ====================================================================
// INSTANT TWIN GENERATION
// ====================================================================

export interface InstantTwinConfig {
  userId: string;
  selectedProviders: DataProvider[];
  dataTimeRange: {
    start: Date;
    end: Date;
  };
  processingPriority: 'fast' | 'thorough';
  privacyLevel: 'minimal' | 'standard' | 'comprehensive';
}

export interface TwinGenerationProgress {
  userId: string;
  stage: 'connecting' | 'ingesting' | 'analyzing' | 'generating' | 'ready' | 'error';
  progress: number; // 0-100
  currentTask: string;
  estimatedTimeRemaining: number; // seconds

  // Detailed progress
  connectorsConnected: DataProvider[];
  dataPointsIngested: number;
  insightsGenerated: number;

  error?: string;
  completedAt?: Date;
}

// ====================================================================
// API RESPONSE TYPES
// ====================================================================

export interface DataConnectorResponse {
  connector: DataConnector;
  authUrl?: string; // for OAuth flow
  status: 'connected' | 'needs_auth' | 'error';
  error?: string;
}

export interface PersonalityAnalysisResponse {
  userId: string;
  insights: PersonalityInsight[];
  overallConfidence: number;
  dataPointsAnalyzed: number;
  analysisQuality: 'low' | 'medium' | 'high';
  nextUpdateRecommended: Date;
}

export interface TwinActionSuggestion {
  id: string;
  type: 'email_response' | 'social_post' | 'calendar_event' | 'message_reply';
  confidence: number;
  content: string;
  context: Record<string, any>;
  requiresApproval: boolean;
  expiresAt: Date;
}

// ====================================================================
// ADVANCED ANALYTICS
// ====================================================================

export interface PersonalityTrend {
  insightType: InsightType;
  trendDirection: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  changeRate: number; // per week
  confidenceTrend: number; // how confidence is changing
  dataPoints: Array<{
    date: Date;
    value: number;
    confidence: number;
  }>;
}

export interface UserEngagementMetrics {
  userId: string;
  period: { start: Date; end: Date };

  // Data engagement
  totalDataPoints: number;
  activeConnectors: number;
  dataGrowthRate: number; // per week

  // Twin interaction
  twinInteractions: number;
  userCorrections: number;
  satisfactionScore: number;

  // Automation usage
  automationTriggers: number;
  automationApprovals: number;
  automationRejections: number;
}

// ====================================================================
// ERROR HANDLING & RECOVERY
// ====================================================================

export interface DataIngestionError {
  id: string;
  connectorId: string;
  errorType: 'api_error' | 'rate_limit' | 'auth_expired' | 'data_corruption' | 'processing_error';
  errorMessage: string;
  errorDetails: Record<string, any>;

  // Recovery information
  isRecoverable: boolean;
  suggestedAction: string;
  retryCount: number;
  nextRetryAt?: Date;

  // Impact assessment
  affectedDataTypes: DataType[];
  impactSeverity: 'low' | 'medium' | 'high' | 'critical';

  createdAt: Date;
  resolvedAt?: Date;
}

// ====================================================================
// PRIVACY & CONSENT MANAGEMENT
// ====================================================================

export interface PrivacySettings {
  userId: string;

  // Data collection preferences
  allowedDataTypes: DataType[];
  allowedProviders: DataProvider[];

  // Processing preferences
  allowAIAnalysis: boolean;
  allowPersonalityInference: boolean;
  allowAutomatedActions: boolean;

  // Retention settings
  maxDataRetentionDays: number;
  autoDeleteSensitiveData: boolean;

  // Sharing preferences
  allowAnonymousResearch: boolean;
  allowUsageAnalytics: boolean;

  lastUpdated: Date;
  consentVersion: string;
}

// ====================================================================
// WEBHOOK & REAL-TIME EVENTS
// ====================================================================

export interface WebhookEvent {
  id: string;
  connectorId: string;
  eventType: string;
  eventData: Record<string, any>;
  receivedAt: Date;
  processed: boolean;
  processingError?: string;
}

export interface RealTimeUpdate {
  userId: string;
  updateType: 'new_data' | 'insight_change' | 'twin_evolution' | 'automation_trigger';
  data: Record<string, any>;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high';
}

// ====================================================================
// ENHANCED AUTOMATED ACTIONS SYSTEM
// ====================================================================

export type ActionType =
  | 'send_notification'
  | 'schedule_review'
  | 'suggest_content'
  | 'initiate_conversation'
  | 'update_learning_path'
  | 'request_feedback'
  | 'sync_external_data'
  | 'generate_insight_report'
  | 'recommend_connections';

export type TriggerType =
  | 'personality_change'
  | 'learning_milestone'
  | 'engagement_pattern'
  | 'time_based'
  | 'data_quality'
  | 'conversation_analysis';

export interface TriggerCondition {
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'not_equals';
  value: string;
}

export interface ActionTrigger {
  type: TriggerType;
  conditions: TriggerCondition[];
}

export interface AutomationAction {
  type: ActionType;
  payload: Record<string, any>;
  delay?: number; // milliseconds
  maxRetries?: number;
}

export interface EnhancedAutomationRule {
  id: string;
  userId: string;
  twinId?: string;
  name: string;
  description: string;
  isActive: boolean;
  priority: number; // 1-10, lower = higher priority
  trigger: ActionTrigger;
  action: AutomationAction;
  cooldownPeriod: number; // milliseconds
  lastTriggered?: Date;
  triggerCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AutomatedAction {
  id: string;
  userId: string;
  twinId: string;
  ruleId?: string;
  actionType: ActionType;
  payload: Record<string, any>;
  priority: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  scheduledFor: Date;
  executedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
}

// Additional types for the enhanced system
export interface DataQualityMetric {
  metricType: 'completeness' | 'accuracy' | 'freshness' | 'consistency';
  score: number; // 0-1
  description: string;
  measuredAt: Date;
}