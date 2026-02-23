/**
 * Demo User Data
 * User profile and platform connection definitions for demo mode
 */

import { getRelativeDateDays, getRelativeDate } from './demoHelpers';

export const DEMO_USER = {
  id: '00000000-0000-0000-0000-000000000001',  // Valid UUID format - must NOT match any real user UUID!
  email: 'alex.rivera@demo.com',
  firstName: 'Alex',
  lastName: 'Rivera',
  fullName: 'Alex Rivera',
  profileImageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AlexRivera',
};

// Active Platforms: Spotify, Google Calendar, YouTube, Discord, LinkedIn
// Using dynamic dates so demo data always looks fresh
export const DEMO_PLATFORM_CONNECTIONS = [
  {
    id: 'demo-conn-spotify',
    platform: 'spotify',
    platformName: 'Spotify',
    connected: true,
    connectedAt: getRelativeDateDays(14), // Connected 14 days ago
    lastSync: getRelativeDate(2), // Synced 2 hours ago
    status: 'active',
    syncStatus: 'synced',
    dataQuality: 'high',
    dataPoints: 2847,
    extractedDataPoints: 2847,
  },
  {
    id: 'demo-conn-calendar',
    platform: 'google_calendar',
    platformName: 'Google Calendar',
    connected: true,
    connectedAt: getRelativeDateDays(14),
    lastSync: getRelativeDate(1),
    status: 'active',
    syncStatus: 'synced',
    dataQuality: 'high',
    dataPoints: 156,
    extractedDataPoints: 156,
  },
  {
    id: 'demo-conn-youtube',
    platform: 'youtube',
    platformName: 'YouTube',
    connected: true,
    connectedAt: getRelativeDateDays(10),
    lastSync: getRelativeDate(3),
    status: 'active',
    syncStatus: 'synced',
    dataQuality: 'high',
    dataPoints: 892,
    extractedDataPoints: 892,
  },
  {
    id: 'demo-conn-discord',
    platform: 'discord',
    platformName: 'Discord',
    connected: true,
    connectedAt: getRelativeDateDays(7),
    lastSync: getRelativeDate(0.5),
    status: 'active',
    syncStatus: 'synced',
    dataQuality: 'medium',
    dataPoints: 1243,
    extractedDataPoints: 1243,
  },
  {
    id: 'demo-conn-linkedin',
    platform: 'linkedin',
    platformName: 'LinkedIn',
    connected: true,
    connectedAt: getRelativeDateDays(12),
    lastSync: getRelativeDate(6),
    status: 'active',
    syncStatus: 'synced',
    dataQuality: 'high',
    dataPoints: 47,
    extractedDataPoints: 47,
  },
];
