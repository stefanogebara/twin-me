/**
 * Demo Combined Data
 * Aggregated demo data combining all domain modules
 */

import { randomInRange, randomFromArray } from './demoHelpers';
import { DEMO_USER } from './demoUser';
import { DEMO_PLATFORM_CONNECTIONS } from './demoUser';
import { getDemoWhoopData, DEMO_WHOOP_DATA } from './demoWhoop';
import { DEMO_CALENDAR_DATA } from './demoCalendar';
import { getDemoSpotifyData, DEMO_SPOTIFY_DATA } from './demoSpotify';
import { DEMO_SOUL_SIGNATURE, DEMO_INSIGHTS } from './demoSoulSignature';

// Dynamic context with randomization
export const getDemoContext = () => {
  const whoopData = getDemoWhoopData();
  const spotifyData = getDemoSpotifyData();

  const summaryOptions = [
    `${whoopData.recovery.label} recovery (${whoopData.recovery.score}%) with a busy day ahead including a client presentation. Consider calm, focused music for preparation.`,
    `Great recovery day (${whoopData.recovery.score}%)! Your energy is ${whoopData.recovery.label.toLowerCase()}. Perfect time for challenging tasks.`,
    `Recovery at ${whoopData.recovery.score}% - ${whoopData.recovery.label}. Sleep quality was ${whoopData.sleep.quality.toLowerCase()}. Match your music to your energy.`,
    `${whoopData.recovery.label} recovery (${whoopData.recovery.score}%) with ${whoopData.strain.label.toLowerCase()} strain. Consider ${spotifyData.recentMood} music to optimize your day.`,
  ];

  return {
    whoop: whoopData.recovery,
    calendar: DEMO_CALENDAR_DATA.todayEvents[0],
    upcomingEvents: DEMO_CALENDAR_DATA.todayEvents,
    spotify: {
      recentMood: spotifyData.recentMood,
      averageEnergy: spotifyData.averageEnergy,
    },
    connectedPlatforms: {
      whoop: true,
      spotify: true,
      calendar: true,
    },
    summary: randomFromArray(summaryOptions),
  };
};

// Static version for backwards compatibility
export const DEMO_CONTEXT = getDemoContext();

export const DEMO_TWIN_STATS = {
  completion_percentage: randomInRange(75, 95),
  total_conversations: randomInRange(8, 25),
  total_messages: randomInRange(30, 80),
  last_interaction: new Date().toISOString(),
  connected_platforms: 3,
};

// Dynamic full data getter
export const getDemoData = () => ({
  user: DEMO_USER,
  platformConnections: DEMO_PLATFORM_CONNECTIONS,
  soulSignature: DEMO_SOUL_SIGNATURE,
  spotifyData: getDemoSpotifyData(),
  calendarData: DEMO_CALENDAR_DATA,
  whoopData: getDemoWhoopData(),
  context: getDemoContext(),
  insights: DEMO_INSIGHTS,
  twinStats: DEMO_TWIN_STATS,
});

// Static version for backwards compatibility
export const DEMO_DATA = {
  user: DEMO_USER,
  platformConnections: DEMO_PLATFORM_CONNECTIONS,
  soulSignature: DEMO_SOUL_SIGNATURE,
  spotifyData: DEMO_SPOTIFY_DATA,
  calendarData: DEMO_CALENDAR_DATA,
  whoopData: DEMO_WHOOP_DATA,
  context: DEMO_CONTEXT,
  insights: DEMO_INSIGHTS,
  twinStats: DEMO_TWIN_STATS,
};
