/**
 * BigFive Assessment - Shared types and constants
 *
 * Interfaces, type aliases, and constants used across BigFive sub-components.
 */

// Types
export interface BigFiveQuestion {
  id: string;
  domain: string;
  facet: number;
  facetName: string;
  text: string;
  keyed: string;
  order: number;
  answered?: boolean;
  previousValue?: number | null;
}

export interface DomainScore {
  raw: number;
  tScore: number;
  percentile: number;
  label: string;
  interpretation: string;
}

export interface BigFiveScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  domains: {
    openness: DomainScore;
    conscientiousness: DomainScore;
    extraversion: DomainScore;
    agreeableness: DomainScore;
    neuroticism: DomainScore;
  };
}

export interface FacetScore {
  id: string;
  name: string;
  domain: string;
  tScore: number;
  percentile: number;
}

export type AssessmentPhase = 'intro' | 'questions' | 'calculating' | 'results';
export type AssessmentVersion = '120' | '50';

// Scale options for 5-point Likert
export const SCALE_OPTIONS = [
  { value: 1, label: 'Very Inaccurate', shortLabel: 'VI' },
  { value: 2, label: 'Moderately Inaccurate', shortLabel: 'MI' },
  { value: 3, label: 'Neither Accurate Nor Inaccurate', shortLabel: 'N' },
  { value: 4, label: 'Moderately Accurate', shortLabel: 'MA' },
  { value: 5, label: 'Very Accurate', shortLabel: 'VA' },
];

// Domain info with colors and icons
export const DOMAIN_INFO: Record<string, { name: string; color: string; description: string }> = {
  O: {
    name: 'Openness',
    color: '#8b5cf6',
    description: 'Openness to new experiences, creativity, and intellectual curiosity'
  },
  C: {
    name: 'Conscientiousness',
    color: '#22c55e',
    description: 'Organization, dependability, and self-discipline'
  },
  E: {
    name: 'Extraversion',
    color: '#f59e0b',
    description: 'Sociability, assertiveness, and positive emotions'
  },
  A: {
    name: 'Agreeableness',
    color: '#06b6d4',
    description: 'Cooperation, trust, and helpfulness toward others'
  },
  N: {
    name: 'Neuroticism',
    color: '#ef4444',
    description: 'Tendency to experience negative emotions and stress'
  }
};
