/**
 * Demo Spotify Data
 * Spotify listening data and personality for demo mode
 */

import {
  randomInRange,
  randomFloat,
  randomFromArray,
  ARTIST_POOLS,
  TRACK_POOLS,
  GENRE_POOLS,
  PEAK_HOURS,
  MOODS,
  generateRecentTrackTime,
  generateListeningHours,
} from './demoHelpers';

// Dynamic Spotify data with randomization
export const getDemoSpotifyData = () => {
  const artistPool = randomFromArray(ARTIST_POOLS);
  const trackPool = randomFromArray(TRACK_POOLS);
  const genrePool = randomFromArray(GENRE_POOLS);

  const topArtists = artistPool.map((artist, idx) => ({
    name: artist,
    plays: randomInRange(400, 900) - idx * 80,
    genre: genrePool[idx] || 'Electronic',
  }));

  // Sort by plays descending
  topArtists.sort((a, b) => b.plays - a.plays);

  const topTracks = artistPool.map((artist, idx) => ({
    name: trackPool[idx] || `Track ${idx + 1}`,
    artist,
    plays: randomInRange(60, 150) - idx * 10,
    playedAt: generateRecentTrackTime(idx),
  }));

  const topGenres = genrePool.map((genre, idx) => ({
    genre,
    percentage: idx === 0 ? randomInRange(28, 38) : randomInRange(8, 22) - idx * 2,
  }));

  // Calculate total percentage and normalize
  const totalPercentage = topGenres.reduce((sum, g) => sum + g.percentage, 0);
  const normalizedGenres = topGenres.map(g => ({
    ...g,
    percentage: Math.round((g.percentage / totalPercentage) * 100)
  }));

  return {
    topArtists,
    topTracks,
    topGenres: normalizedGenres,
    listeningHours: generateListeningHours(),
    listeningHabits: {
      peakHours: randomFromArray(PEAK_HOURS),
      weekdayVsWeekend: randomFromArray([
        'Weekend heavy (65% vs 35%)',
        'Weekday heavy (60% vs 40%)',
        'Balanced (52% vs 48%)',
      ]),
      averageSessionLength: `${randomInRange(25, 65)} minutes`,
      skipRate: `${randomInRange(8, 22)}%`,
    },
    recentMood: randomFromArray(MOODS),
    averageEnergy: randomFloat(0.4, 0.8, 2),
  };
};

// Static version for backwards compatibility
export const DEMO_SPOTIFY_DATA = getDemoSpotifyData();

// Demo Spotify personality for SoulSignatureDashboard
export const DEMO_SPOTIFY_PERSONALITY = {
  success: true,
  bigFive: {
    openness: { score: 78, level: 'high', description: 'Curious and adventurous - you explore diverse genres and new artists' },
    conscientiousness: { score: 65, level: 'moderate', description: 'Flexible approach to music organization' },
    extraversion: { score: 72, level: 'high', description: 'High-energy preferences - upbeat tracks fuel your day' },
    agreeableness: { score: 45, level: 'moderate', description: 'Mix of personal and shared playlists' },
    neuroticism: { score: 35, level: 'low', description: 'Emotionally stable - consistent mood in choices' }
  },
  archetype: {
    key: 'eclectic-explorer',
    name: 'Eclectic Explorer',
    description: 'You traverse the entire musical landscape, never settling in one genre',
    traits: ['Open-minded', 'Curious', 'Adventurous'],
    confidence: 82
  },
  topGenres: {
    current: ['indie pop', 'electronic', 'hip hop', 'lo-fi', 'alternative'],
    allTime: ['pop', 'rock', 'electronic', 'indie', 'hip hop'],
    stability: { score: 0.65, label: 'moderately-stable' }
  },
  listeningPatterns: {
    peakHours: [21, 22, 20, 19],
    personality: ['evening-focused', 'weekend-enthusiast'],
    weekdayVsWeekend: { weekday: 65, weekend: 35 },
    consistency: { score: 0.55, label: 'moderately-consistent' }
  },
  dataTimestamp: new Date().toISOString()
};
