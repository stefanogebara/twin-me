/**
 * Soul Signature Service
 *
 * Centralized service for calculating and managing soul signature authenticity scores.
 * Ensures consistency across all pages and components.
 */

export interface PlatformConnection {
  id: string;
  platform: string;
  connected: boolean;
  lastSync?: Date;
  dataQuality?: 'high' | 'medium' | 'low';
  extractedDataPoints?: number;
}

export interface SoulSignatureScore {
  overall: number; // 0-100%
  personalSoul: number; // 0-100% for entertainment/lifestyle platforms
  professionalSoul: number; // 0-100% for work platforms
  breakdown: {
    platformConnections: number; // 0-30 points
    dataExtracted: number; // 0-40 points
    dataQuality: number; // 0-20 points
    timeSinceLastSync: number; // 0-10 points
  };
  insights: {
    totalPlatforms: number;
    connectedPlatforms: number;
    personalPlatforms: number;
    professionalPlatforms: number;
    totalDataPoints: number;
    lastSyncTime?: Date;
  };
}

// Platform categorization
const PERSONAL_PLATFORMS = [
  'spotify', 'netflix', 'youtube', 'steam', 'twitch',
  'discord', 'reddit', 'goodreads', 'instagram', 'tiktok'
];

const PROFESSIONAL_PLATFORMS = [
  'gmail', 'google-calendar', 'slack', 'microsoft-teams',
  'github', 'linkedin', 'google-drive'
];

/**
 * Calculate the authenticity score based on connected platforms and data quality
 */
export function calculateAuthenticityScore(connections: PlatformConnection[]): SoulSignatureScore {
  const connectedPlatforms = connections.filter(c => c.connected);
  const personalConnections = connectedPlatforms.filter(c =>
    PERSONAL_PLATFORMS.includes(c.platform.toLowerCase())
  );
  const professionalConnections = connectedPlatforms.filter(c =>
    PROFESSIONAL_PLATFORMS.includes(c.platform.toLowerCase())
  );

  // Calculate breakdown scores
  const platformConnectionsScore = Math.min(
    (connectedPlatforms.length / 10) * 30, // Max 30 points for 10+ platforms
    30
  );

  const totalDataPoints = connectedPlatforms.reduce(
    (sum, p) => sum + (p.extractedDataPoints || 0),
    0
  );
  const dataExtractedScore = Math.min(
    (totalDataPoints / 1000) * 40, // Max 40 points for 1000+ data points
    40
  );

  const avgDataQuality = connectedPlatforms.length > 0
    ? connectedPlatforms.reduce((sum, p) => {
        const qualityScore = p.dataQuality === 'high' ? 1 : p.dataQuality === 'medium' ? 0.6 : 0.3;
        return sum + qualityScore;
      }, 0) / connectedPlatforms.length
    : 0;
  const dataQualityScore = avgDataQuality * 20; // Max 20 points

  // Time-based score (penalize old syncs)
  const mostRecentSync = connectedPlatforms.reduce((latest: Date | null, p) => {
    if (!p.lastSync) return latest;
    const syncDate = p.lastSync instanceof Date ? p.lastSync : new Date(p.lastSync);
    return !latest || syncDate > latest ? syncDate : latest;
  }, null);

  let timeSinceLastSyncScore = 10; // Default full points
  if (mostRecentSync) {
    const hoursSinceSync = (Date.now() - mostRecentSync.getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync > 168) timeSinceLastSyncScore = 0; // > 1 week
    else if (hoursSinceSync > 48) timeSinceLastSyncScore = 5; // > 2 days
    else if (hoursSinceSync > 24) timeSinceLastSyncScore = 7; // > 1 day
  }

  // Calculate overall score
  const overall = Math.round(
    platformConnectionsScore +
    dataExtractedScore +
    dataQualityScore +
    timeSinceLastSyncScore
  );

  // Calculate personal vs professional scores
  const personalScore = personalConnections.length > 0
    ? Math.min(
        (personalConnections.length / PERSONAL_PLATFORMS.length) * 100,
        100
      )
    : 0;

  const professionalScore = professionalConnections.length > 0
    ? Math.min(
        (professionalConnections.length / PROFESSIONAL_PLATFORMS.length) * 100,
        100
      )
    : 0;

  return {
    overall: Math.min(overall, 100),
    personalSoul: Math.round(personalScore),
    professionalSoul: Math.round(professionalScore),
    breakdown: {
      platformConnections: Math.round(platformConnectionsScore),
      dataExtracted: Math.round(dataExtractedScore),
      dataQuality: Math.round(dataQualityScore),
      timeSinceLastSync: Math.round(timeSinceLastSyncScore)
    },
    insights: {
      totalPlatforms: PERSONAL_PLATFORMS.length + PROFESSIONAL_PLATFORMS.length,
      connectedPlatforms: connectedPlatforms.length,
      personalPlatforms: personalConnections.length,
      professionalPlatforms: professionalConnections.length,
      totalDataPoints,
      lastSyncTime: mostRecentSync || undefined
    }
  };
}

/**
 * Get a human-readable description of the authenticity score
 */
export function getScoreDescription(score: number): string {
  if (score >= 80) return 'Highly Authentic - Rich soul signature';
  if (score >= 60) return 'Well Formed - Good soul representation';
  if (score >= 40) return 'Emerging - Building your signature';
  if (score >= 20) return 'Getting Started - Connect more platforms';
  return 'Just Beginning - Start connecting platforms';
}

/**
 * Get recommendations for improving authenticity score
 */
export function getScoreRecommendations(
  score: SoulSignatureScore
): string[] {
  const recommendations: string[] = [];

  if (score.insights.personalPlatforms < 3) {
    recommendations.push('Connect entertainment platforms like Spotify, Netflix, or YouTube to reveal your authentic interests');
  }

  if (score.insights.professionalPlatforms === 0) {
    recommendations.push('Connect Gmail or Calendar to understand your professional patterns');
  }

  if (score.breakdown.dataExtracted < 20) {
    recommendations.push('Allow time for platform data extraction to complete');
  }

  if (score.breakdown.dataQuality < 15) {
    recommendations.push('Re-sync platforms to improve data quality');
  }

  if (score.breakdown.timeSinceLastSync < 7) {
    recommendations.push('Platforms haven\'t synced recently - refresh your connections');
  }

  if (score.overall >= 80) {
    recommendations.push('Your soul signature is rich! Try the Twin Chat to see your patterns');
  }

  return recommendations;
}

/**
 * Format the score for display
 */
export function formatScore(score: number): string {
  return `${Math.round(score)}%`;
}

/**
 * Get the color class for the score (for UI styling)
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-yellow-600';
  if (score >= 20) return 'text-orange-600';
  return 'text-stone-600';
}
