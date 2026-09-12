export interface Reflection {
  id: string | null;
  text: string;
  generatedAt: string;
  expiresAt: string | null;
  confidence: 'high' | 'medium' | 'low';
  themes: string[];
}

export interface Pattern {
  id: string;
  text: string;
  occurrences: 'often' | 'sometimes' | 'noticed';
}

export interface HistoryItem {
  id: string;
  text: string;
  generatedAt: string;
}

export interface EvidenceItem {
  id: string;
  observation: string;
  dataPoints: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface CategoryItem {
  category: string;
  count: number;
  percentage: number;
}

export interface DomainItem {
  domain: string;
  count: number;
}

export interface RecentActivityItem {
  title?: string;
  domain?: string;
  category?: string;
  timeOnPage?: number;
  timestamp?: string;
}

export interface ReadingProfile {
  avgEngagement: number | null;
  avgTimeOnPage: number | null;
  dominantBehavior: string | null;
  readingBehaviors: Record<string, number>;
  contentTypeDistribution: Record<string, number>;
}

export interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  webTopCategories?: CategoryItem[];
  webTopDomains?: DomainItem[];
  webTopTopics?: string[];
  webRecentSearches?: string[];
  webReadingProfile?: ReadingProfile | null;
  webRecentActivity?: RecentActivityItem[];
  webTotalPageVisits?: number;
  webTotalSearches?: number;
  hasExtensionData?: boolean;
  error?: string;
}
