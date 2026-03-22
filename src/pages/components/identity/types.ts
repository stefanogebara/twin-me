export interface IdentityContext {
  lifeStage: string;
  culturalOrientation: string;
  careerSalience: string;
  approximateAge: number | null;
  confidence: number;
  promptFragment: string;
  twinVoiceHint: string;
  inferredAt: string;
}

export interface SoulProfile {
  archetype: string | null;
  uniqueness_markers: string[] | null;
  music_signature: {
    top_genres?: string[];
    listening_patterns?: string;
    [key: string]: unknown;
  } | null;
  core_values: string[] | null;
  personality_summary: string | null;
}

export interface IdentityData {
  identity: IdentityContext | null;
  profile: SoulProfile | null;
  expertInsights: Record<string, string[]>;
  summary: string | null;
  summaryUpdatedAt: string | null;
}

export interface PersonalityProfile {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  temperature: number;
  top_p: number;
  confidence: number;
  memory_count_at_build?: number;
  last_built_at: string;
}

export type ExpertKey =
  | 'personality_psychologist'
  | 'lifestyle_analyst'
  | 'cultural_identity'
  | 'social_dynamics'
  | 'motivation_analyst';

export const EXPERT_SECTIONS: Array<{
  key: ExpertKey;
  label: string;
  dotColor: string;
}> = [
  { key: 'personality_psychologist', label: 'Personality', dotColor: '#c17e2c' },
  { key: 'lifestyle_analyst', label: 'Lifestyle', dotColor: '#5d5cae' },
  { key: 'cultural_identity', label: 'Cultural Taste', dotColor: '#c1452c' },
  { key: 'social_dynamics', label: 'Social Dynamics', dotColor: '#2cc1a0' },
  { key: 'motivation_analyst', label: 'Motivation', dotColor: '#c1a02c' },
];
