/**
 * Platform Category Data Hook
 *
 * Lazy loads platform data only when a category card is expanded.
 * Caches results to avoid re-fetching on subsequent expansions.
 */

import { useState, useCallback, useRef } from 'react';

export interface PlatformData {
  platform: string;
  connected: boolean;
  lastSync: string | null;
  metrics: {
    label: string;
    value: string | number;
    type?: 'number' | 'text' | 'percentage';
  }[];
  insight?: string;
  error?: string;
}

export interface CategoryData {
  platforms: Record<string, PlatformData>;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
}

interface UsePlatformCategoryDataReturn {
  categoryData: CategoryData;
  fetchCategoryData: (platforms: string[], connectedProviders: string[]) => Promise<void>;
  isLoading: boolean;
  hasData: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Fetch data for a single platform
 */
const fetchPlatformData = async (platform: string, token: string): Promise<PlatformData> => {
  try {
    const response = await fetch(`${API_URL}/nango/extract/${platform}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${platform} data`);
    }

    const result = await response.json();

    // Transform API response into standardized metrics
    const metrics = extractMetrics(platform, result);
    const insight = generateInsight(platform, result);

    return {
      platform,
      connected: true,
      lastSync: result.lastSync || new Date().toISOString(),
      metrics,
      insight
    };
  } catch (error) {
    console.error(`Error fetching ${platform} data:`, error);
    return {
      platform,
      connected: true,
      lastSync: null,
      metrics: [],
      error: error instanceof Error ? error.message : 'Failed to load data'
    };
  }
};

/**
 * Extract key metrics from platform data
 */
const extractMetrics = (platform: string, data: any): PlatformData['metrics'] => {
  switch (platform) {
    case 'spotify':
      return [
        { label: 'Top Genre', value: data.topGenres?.[0] || 'Unknown', type: 'text' },
        { label: 'Tracks', value: data.totalTracks || 0, type: 'number' },
        { label: 'Artists', value: data.uniqueArtists || 0, type: 'number' }
      ];
    case 'youtube':
      return [
        { label: 'Subscriptions', value: data.subscriptionCount || 0, type: 'number' },
        { label: 'Watch Time', value: `${data.watchHours || 0}h`, type: 'text' },
        { label: 'Top Category', value: data.topCategory || 'Unknown', type: 'text' }
      ];
    case 'twitch':
      return [
        { label: 'Following', value: data.followingCount || 0, type: 'number' },
        { label: 'Watch Time', value: `${data.watchHours || 0}h`, type: 'text' },
        { label: 'Top Game', value: data.topGame || 'Unknown', type: 'text' }
      ];
    case 'whoop':
      return [
        { label: 'Recovery', value: `${data.recoveryScore || 0}%`, type: 'percentage' },
        { label: 'Strain', value: data.strain?.toFixed(1) || '0', type: 'number' },
        { label: 'Sleep', value: `${data.sleepHours?.toFixed(1) || 0}h`, type: 'text' }
      ];
    case 'google_calendar':
    case 'outlook':
      return [
        { label: 'Events Today', value: data.todayEvents || 0, type: 'number' },
        { label: 'This Week', value: data.weekEvents || 0, type: 'number' },
        { label: 'Busy Time', value: `${data.busyPercentage || 0}%`, type: 'percentage' }
      ];
    case 'discord':
      return [
        { label: 'Servers', value: data.serverCount || 0, type: 'number' },
        { label: 'Messages', value: data.messageCount || 0, type: 'number' },
        { label: 'Active In', value: data.activeServers || 0, type: 'number' }
      ];
    case 'reddit':
      return [
        { label: 'Karma', value: data.karma || 0, type: 'number' },
        { label: 'Subreddits', value: data.subredditCount || 0, type: 'number' },
        { label: 'Posts', value: data.postCount || 0, type: 'number' }
      ];
    case 'github':
      return [
        { label: 'Repos', value: data.repoCount || 0, type: 'number' },
        { label: 'Commits', value: data.commitCount || 0, type: 'number' },
        { label: 'Stars', value: data.starCount || 0, type: 'number' }
      ];
    case 'gmail':
      return [
        { label: 'Unread', value: data.unreadCount || 0, type: 'number' },
        { label: 'Threads', value: data.threadCount || 0, type: 'number' },
        { label: 'Labels', value: data.labelCount || 0, type: 'number' }
      ];
    default:
      return [];
  }
};

/**
 * Generate a brief AI-style insight for the platform
 */
const generateInsight = (platform: string, data: any): string => {
  switch (platform) {
    case 'spotify':
      return data.topGenres?.[0]
        ? `Your music reveals a ${data.topGenres[0].toLowerCase()} soul with eclectic tastes`
        : 'Connect to discover your musical personality';
    case 'youtube':
      return data.topCategory
        ? `You gravitate toward ${data.topCategory.toLowerCase()} content`
        : 'Your viewing patterns reveal curiosity';
    case 'twitch':
      return data.topGame
        ? `${data.topGame} is your streaming home`
        : 'Your streaming preferences are unique';
    case 'whoop':
      return data.recoveryScore >= 70
        ? 'Your body is well-recovered and ready for action'
        : data.recoveryScore >= 50
        ? 'Moderate recovery - balance activity and rest'
        : 'Low recovery detected - prioritize rest today';
    case 'google_calendar':
    case 'outlook':
      return data.busyPercentage >= 70
        ? 'Busy schedule ahead - protect your focus time'
        : 'Well-balanced calendar with room to breathe';
    case 'discord':
      return `Active in ${data.activeServers || 0} communities`;
    case 'reddit':
      return 'Your discussions shape your digital identity';
    case 'github':
      return data.commitCount > 100
        ? 'Prolific contributor with consistent commits'
        : 'Your code tells your story';
    case 'gmail':
      return data.unreadCount > 50
        ? 'Inbox needs attention'
        : 'Well-managed email flow';
    default:
      return 'Analyzing your digital footprint...';
  }
};

/**
 * Hook for managing platform category data with lazy loading
 */
export const usePlatformCategoryData = (): UsePlatformCategoryDataReturn => {
  const [categoryData, setCategoryData] = useState<CategoryData>({
    platforms: {},
    loading: false,
    error: null,
    lastFetched: null
  });

  // Cache to avoid re-fetching
  const cacheRef = useRef<Record<string, PlatformData>>({});

  const fetchCategoryData = useCallback(async (
    platforms: string[],
    connectedProviders: string[]
  ) => {
    setCategoryData(prev => ({ ...prev, loading: true, error: null }));

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setCategoryData(prev => ({
        ...prev,
        loading: false,
        error: 'Not authenticated'
      }));
      return;
    }

    try {
      const platformResults: Record<string, PlatformData> = {};

      // Check cache first for each platform
      const platformsToFetch = platforms.filter(p => {
        if (cacheRef.current[p]) {
          platformResults[p] = cacheRef.current[p];
          return false;
        }
        return connectedProviders.includes(p);
      });

      // Add disconnected platforms
      platforms.forEach(p => {
        if (!connectedProviders.includes(p) && !platformResults[p]) {
          platformResults[p] = {
            platform: p,
            connected: false,
            lastSync: null,
            metrics: []
          };
        }
      });

      // Fetch data in parallel for connected platforms
      if (platformsToFetch.length > 0) {
        const fetchPromises = platformsToFetch.map(p => fetchPlatformData(p, token));
        const results = await Promise.all(fetchPromises);

        results.forEach(result => {
          platformResults[result.platform] = result;
          cacheRef.current[result.platform] = result;
        });
      }

      setCategoryData({
        platforms: platformResults,
        loading: false,
        error: null,
        lastFetched: new Date()
      });
    } catch (error) {
      console.error('Error fetching category data:', error);
      setCategoryData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load data'
      }));
    }
  }, []);

  return {
    categoryData,
    fetchCategoryData,
    isLoading: categoryData.loading,
    hasData: Object.keys(categoryData.platforms).length > 0
  };
};
