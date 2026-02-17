import React from 'react';

export interface PersonalityScores {
  id: string;
  mind?: number;
  energy?: number;
  nature?: number;
  tactics?: number;
  identity?: number;
  mind_ci?: number;
  energy_ci?: number;
  nature_ci?: number;
  tactics_ci?: number;
  identity_ci?: number;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  openness_confidence: number;
  conscientiousness_confidence: number;
  extraversion_confidence: number;
  agreeableness_confidence: number;
  neuroticism_confidence: number;
  archetype_code?: string;
  analyzed_platforms: string[];
  sample_size: number;
}

export interface SoulSignature {
  id: string;
  archetype_name: string;
  archetype_subtitle: string;
  narrative: string;
  defining_traits: Array<{
    trait: string;
    score: number;
    evidence: string;
  }>;
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  icon_type: string;
}

export interface BehavioralFeature {
  id: string;
  platform: string;
  feature_type: string;
  feature_value: number;
  contributes_to: string;
  confidence_score: number;
}

export interface SpotifyPersonality {
  success: boolean;
  bigFive?: {
    openness: { score: number; level: string; description: string };
    conscientiousness: { score: number; level: string; description: string };
    extraversion: { score: number; level: string; description: string };
    agreeableness: { score: number; level: string; description: string };
    neuroticism: { score: number; level: string; description: string };
  };
  archetype?: {
    key: string;
    name: string;
    description: string;
    traits: string[];
    confidence: number;
  };
  topGenres?: {
    current: string[];
    allTime: string[];
    stability: { score: number; label: string };
  };
  listeningPatterns?: {
    peakHours: number[];
    personality: string[];
    weekdayVsWeekend: { weekday: number; weekend: number };
    consistency: { score: number; label: string };
  };
  dataTimestamp?: string;
}

export interface EvidenceItem {
  platform: string;
  feature: string;
  value: number;
  raw_value?: Record<string, unknown>;
  correlation: number;
  effect_size: 'small' | 'medium' | 'large';
  description: string;
  citation: string;
}

export interface BehavioralEvidence {
  openness: EvidenceItem[];
  conscientiousness: EvidenceItem[];
  extraversion: EvidenceItem[];
  agreeableness: EvidenceItem[];
  neuroticism: EvidenceItem[];
}

export interface EvidenceConfidence {
  overall: number;
  by_dimension: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
}

export interface BehavioralEvidenceData {
  evidence: BehavioralEvidence;
  confidence: EvidenceConfidence;
  dataSources?: Record<string, { days: number; events: number }>;
}

export type TabId = 'overview' | 'deep-dive' | 'data-sources';

export const MBTI_DIMENSIONS = {
  mind: {
    name: 'Mind',
    lowLabel: 'Introverted',
    highLabel: 'Extraverted',
    lowLetter: 'I',
    highLetter: 'E',
    color: '#4298B4',
    description: 'How you interact with the world and where you direct your energy',
    lowDesc: 'Prefer solitary activities, think before speaking, feel drained by social interaction',
    highDesc: 'Prefer group activities, think out loud, feel energized by social interaction'
  },
  energy: {
    name: 'Energy',
    lowLabel: 'Observant',
    highLabel: 'Intuitive',
    lowLetter: 'S',
    highLetter: 'N',
    color: '#E4AE3A',
    description: 'How you see the world and process information',
    lowDesc: 'Focus on facts and details, prefer practical solutions, trust experience',
    highDesc: 'Focus on patterns and possibilities, prefer innovative solutions, trust intuition'
  },
  nature: {
    name: 'Nature',
    lowLabel: 'Thinking',
    highLabel: 'Feeling',
    lowLetter: 'T',
    highLetter: 'F',
    color: '#33A474',
    description: 'How you make decisions and cope with emotions',
    lowDesc: 'Prioritize logic and objectivity, focus on truth over tact',
    highDesc: 'Prioritize empathy and harmony, focus on values and feelings'
  },
  tactics: {
    name: 'Tactics',
    lowLabel: 'Prospecting',
    highLabel: 'Judging',
    lowLetter: 'P',
    highLetter: 'J',
    color: '#88619A',
    description: 'How you approach work and planning',
    lowDesc: 'Prefer flexibility and spontaneity, keep options open, adapt easily',
    highDesc: 'Prefer structure and planning, like closure and completion'
  },
  identity: {
    name: 'Identity',
    lowLabel: 'Turbulent',
    highLabel: 'Assertive',
    lowLetter: 'T',
    highLetter: 'A',
    color: '#F25E62',
    description: 'How confident you are in your abilities and decisions',
    lowDesc: 'Self-conscious, sensitive to stress, perfectionist, success-driven',
    highDesc: 'Self-assured, even-tempered, resistant to stress, confident'
  }
} as const;

export const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {};

export interface ThemeColors {
  textColor: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  hoverBg: string;
  subtleBg: string;
  theme: string;
}
