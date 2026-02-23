/**
 * Data Transformation Utilities
 * Transforms soul signature data into visualization-ready formats
 */

export interface RadarDataPoint {
  trait: string;
  value: number;
  fullMark: number;
}

export interface ClusterData {
  id: string;
  name: string;
  category: 'personal' | 'professional' | 'creative';
  size: number;
  strength: number;
  items: string[];
  x?: number;
  y?: number;
  radius?: number;
}

export interface PatternData {
  id: string;
  title: string;
  description: string;
  confidence: number;
  platforms: string[];
  insight: string;
}

/**
 * Transform soul signature to radar chart data (Big Five personality traits)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic soul signature shape from API
export function transformToRadarData(soulSignature: any): RadarDataPoint[] {
  const personality = soulSignature?.personality || {};

  return [
    {
      trait: 'Openness',
      value: Math.round((personality.openness || 0.5) * 100),
      fullMark: 100
    },
    {
      trait: 'Conscientiousness',
      value: Math.round((personality.conscientiousness || 0.5) * 100),
      fullMark: 100
    },
    {
      trait: 'Extraversion',
      value: Math.round((personality.extraversion || 0.5) * 100),
      fullMark: 100
    },
    {
      trait: 'Agreeableness',
      value: Math.round((personality.agreeableness || 0.5) * 100),
      fullMark: 100
    },
    {
      trait: 'Neuroticism',
      value: Math.round((personality.neuroticism || 0.5) * 100),
      fullMark: 100
    }
  ];
}

/**
 * Transform interests to cluster data for bubble chart
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic soul signature shape from API
export function transformToClusterData(soulSignature: any): ClusterData[] {
  const clusters: ClusterData[] = [];

  // Personal clusters
  const personalClusters = soulSignature?.personalClusters || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cluster items have dynamic shape
  personalClusters.forEach((cluster: any, index: number) => {
    clusters.push({
      id: `personal-${index}`,
      name: cluster.name || `Personal ${index + 1}`,
      category: 'personal',
      size: cluster.dataPoints?.length || 10,
      strength: cluster.intensityLevel || 50,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- data point shape varies by platform
      items: cluster.dataPoints?.map((dp: any) => dp.title || dp.name) || []
    });
  });

  // Professional clusters
  const professionalClusters = soulSignature?.professionalClusters || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cluster items have dynamic shape
  professionalClusters.forEach((cluster: any, index: number) => {
    clusters.push({
      id: `professional-${index}`,
      name: cluster.name || `Professional ${index + 1}`,
      category: 'professional',
      size: cluster.dataPoints?.length || 10,
      strength: cluster.intensityLevel || 50,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- data point shape varies by platform
      items: cluster.dataPoints?.map((dp: any) => dp.title || dp.name) || []
    });
  });

  // Creative clusters
  const creativeClusters = soulSignature?.creativeClusters || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cluster items have dynamic shape
  creativeClusters.forEach((cluster: any, index: number) => {
    clusters.push({
      id: `creative-${index}`,
      name: cluster.name || `Creative ${index + 1}`,
      category: 'creative',
      size: cluster.dataPoints?.length || 10,
      strength: cluster.intensityLevel || 50,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- data point shape varies by platform
      items: cluster.dataPoints?.map((dp: any) => dp.title || dp.name) || []
    });
  });

  return clusters;
}

/**
 * Calculate completeness percentage
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic platform connection and soul signature shapes
export function calculateCompleteness(platforms: any[], soulSignature: any): {
  overall: number;
  breakdown: {
    personal: number;
    professional: number;
    creative: number;
  };
} {
  const totalPlatforms = 30; // Target number of platform connections
  const connectedCount = platforms.filter(p => p.connected).length;

  const personalCount = soulSignature?.personalClusters?.length || 0;
  const professionalCount = soulSignature?.professionalClusters?.length || 0;
  const creativeCount = soulSignature?.creativeClusters?.length || 0;

  const personal = Math.min(100, (personalCount / 5) * 100); // Target: 5 clusters
  const professional = Math.min(100, (professionalCount / 5) * 100);
  const creative = Math.min(100, (creativeCount / 3) * 100); // Target: 3 clusters

  const overall = Math.min(100, ((connectedCount / totalPlatforms) * 100 + personal + professional + creative) / 4);

  return {
    overall: Math.round(overall),
    breakdown: {
      personal: Math.round(personal),
      professional: Math.round(professional),
      creative: Math.round(creative)
    }
  };
}

/**
 * Get category color based on type
 */
export function getCategoryColor(category: 'personal' | 'professional' | 'creative'): {
  light: string;
  medium: string;
  dark: string;
} {
  switch (category) {
    case 'personal':
      return {
        light: '#10B981',
        medium: '#059669',
        dark: '#047857'
      };
    case 'professional':
      return {
        light: '#3B82F6',
        medium: '#2563EB',
        dark: '#1D4ED8'
      };
    case 'creative':
      return {
        light: '#F59E0B',
        medium: '#D97706',
        dark: '#B45309'
      };
  }
}

/**
 * Format date for timeline display
 */
export function formatTimelineDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

  return `${Math.floor(diffDays / 365)} years ago`;
}
