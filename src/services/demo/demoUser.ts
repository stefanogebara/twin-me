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

// MVP Platforms Only: Spotify, Google Calendar, Whoop
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
    connectedAt: getRelativeDateDays(14), // Connected 14 days ago
    lastSync: getRelativeDate(1), // Synced 1 hour ago
    status: 'active',
    syncStatus: 'synced',
    dataQuality: 'high',
    dataPoints: 156,
    extractedDataPoints: 156,
  },
];
