/**
 * Platform Category Configuration
 *
 * Defines the 5 main categories for organizing connected platforms
 * and their visual/data properties.
 */

export interface CategoryConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  platforms: string[];
  description: string;
}

export const PLATFORM_CATEGORIES: Record<string, CategoryConfig> = {
  entertainment: {
    id: 'entertainment',
    name: 'Entertainment',
    icon: 'Music',
    color: '#1DB954',
    platforms: ['spotify', 'youtube'],
    description: 'Your musical soul and content choices'
  },
  productivity: {
    id: 'productivity',
    name: 'Time & Productivity',
    icon: 'Calendar',
    color: '#6366F1',
    platforms: ['google_calendar'],
    description: 'How you structure your days'
  }
} as const;

/**
 * Get category by platform ID
 */
export const getCategoryForPlatform = (platform: string): CategoryConfig | null => {
  for (const category of Object.values(PLATFORM_CATEGORIES)) {
    if (category.platforms.includes(platform)) {
      return category;
    }
  }
  return null;
};

/**
 * Get all platforms across all categories
 */
export const getAllPlatforms = (): string[] => {
  return Object.values(PLATFORM_CATEGORIES).flatMap(cat => cat.platforms);
};

/**
 * Platform display names and icons
 */
export const PLATFORM_INFO: Record<string, { name: string; icon: string; color: string }> = {
  spotify: { name: 'Spotify', icon: 'Music', color: '#1DB954' },
  youtube: { name: 'YouTube', icon: 'Youtube', color: '#FF0000' },
  google_calendar: { name: 'Google Calendar', icon: 'Calendar', color: '#4285F4' },
};
