/**
 * Types for the Twin Portrait / Soul Signature page.
 * Maps directly to the GET /api/twin/portrait response.
 */

export interface TwinDomains {
  personality?: string;
  lifestyle?: string;
  culturalIdentity?: string;
  socialDynamics?: string;
  motivation?: string;
}

export interface TwinSummaryData {
  summary: string;
  domains: TwinDomains;
  generatedAt: string;
}

export interface ExpertReflection {
  id: string;
  content: string;
  importance_score: number;
  metadata: {
    expert?: string;
    domain?: string;
    depth?: number;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface ProactiveInsight {
  id: string;
  insight: string;
  urgency: 'low' | 'medium' | 'high';
  category: 'trend' | 'anomaly' | 'celebration' | 'concern' | 'goal_progress' | 'goal_suggestion';
  created_at: string;
  delivered: boolean;
}

export interface MemoryStats {
  total: number;
  byType: {
    fact: number;
    reflection: number;
    platform_data: number;
    conversation: number;
    observation: number;
  };
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string;
  metric_type: string;
  target_value: number;
  status: 'suggested' | 'active' | 'completed' | 'abandoned';
  duration_days: number;
  total_days_tracked: number;
  total_days_met: number;
  current_streak: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface PlatformSummary {
  [platform: string]: {
    latestAt: string;
    recentObservations: string[];
  };
}

export interface PersonalityScoresData {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  archetype_code?: string;
  analyzed_platforms?: string[];
  source_type?: string;
}

export interface ConnectedPlatform {
  platform: string;
  status: string;
  last_sync_at: string | null;
}

export interface SoulSignatureData {
  archetype_name: string;
  archetype_subtitle: string | null;
  narrative: string;
  defining_traits: Array<{ trait: string; source?: string }> | string[] | null;
  created_at: string;
}

export interface TwinPortraitData {
  twinSummary: TwinSummaryData | null;
  reflections: ExpertReflection[];
  insights: ProactiveInsight[];
  memoryStats: MemoryStats;
  goals: Goal[];
  platformData: PlatformSummary | null;
  personalityScores: PersonalityScoresData | null;
  connectedPlatforms: ConnectedPlatform[];
  firstMemoryAt: string | null;
  soulSignature?: SoulSignatureData | null;
}
