/**
 * Demo Data Service
 * Provides realistic sample data for demo mode
 * MVP Focus: Spotify, Google Calendar, Whoop only
 */

// Randomization helper functions
const randomInRange = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const randomFloat = (min: number, max: number, decimals: number = 1): number => {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
};

const randomFromArray = <T>(arr: T[]): T => {
  return arr[Math.floor(Math.random() * arr.length)];
};

// Recovery label pools
const RECOVERY_LABELS = ['Low', 'Moderate', 'Good', 'Optimal'] as const;
const STRAIN_LABELS = ['Light', 'Moderate', 'High', 'Very High'] as const;
const SLEEP_QUALITIES = ['Poor', 'Fair', 'Good', 'Excellent'] as const;
const MOODS = ['focused', 'energetic', 'relaxed', 'creative', 'productive'] as const;

// Artist pools for variety
const ARTIST_POOLS = [
  ['Tycho', 'Boards of Canada', 'Aphex Twin', 'Four Tet', 'ODESZA'],
  ['Khruangbin', 'Tame Impala', 'Glass Animals', 'MGMT', 'Unknown Mortal Orchestra'],
  ['Bonobo', 'Caribou', 'Jon Hopkins', 'Floating Points', 'Moderat'],
  ['Nils Frahm', 'Olafur Arnalds', 'Max Richter', 'Ludovico Einaudi', 'Kiasmos'],
];

export const DEMO_USER = {
  id: 'a483a979-cf85-481d-b65b-af396c2c513a',
  email: 'alex.rivera@demo.com',
  firstName: 'Alex',
  lastName: 'Rivera',
  fullName: 'Alex Rivera',
  profileImageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AlexRivera',
};

// MVP Platforms Only: Spotify, Google Calendar, Whoop
export const DEMO_PLATFORM_CONNECTIONS = [
  {
    id: 'demo-conn-spotify',
    platform: 'spotify',
    platformName: 'Spotify',
    connected: true,
    connectedAt: '2025-01-15T10:30:00Z',
    lastSync: '2025-01-30T08:15:00Z',
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
    connectedAt: '2025-01-15T10:35:00Z',
    lastSync: '2025-01-30T09:00:00Z',
    status: 'active',
    syncStatus: 'synced',
    dataQuality: 'high',
    dataPoints: 156,
    extractedDataPoints: 156,
  },
  {
    id: 'demo-conn-whoop',
    platform: 'whoop',
    platformName: 'Whoop',
    connected: true,
    connectedAt: '2025-01-15T10:40:00Z',
    lastSync: '2025-01-30T07:30:00Z',
    status: 'active',
    syncStatus: 'synced',
    dataQuality: 'high',
    dataPoints: 730,
    extractedDataPoints: 730,
  },
];

// Dynamic Whoop data with randomization
export const getDemoWhoopData = () => {
  const recoveryScore = randomInRange(45, 95);
  const recoveryLabel = recoveryScore >= 80 ? 'Optimal' : recoveryScore >= 65 ? 'Good' : recoveryScore >= 50 ? 'Moderate' : 'Low';

  const strainScore = randomFloat(6, 18, 1);
  const strainLabel = strainScore >= 16 ? 'Very High' : strainScore >= 12 ? 'High' : strainScore >= 8 ? 'Moderate' : 'Light';

  const sleepHours = randomFloat(5.5, 9, 1);
  const sleepQuality = sleepHours >= 8 ? 'Excellent' : sleepHours >= 7 ? 'Good' : sleepHours >= 6 ? 'Fair' : 'Poor';

  return {
    recovery: {
      score: recoveryScore,
      label: recoveryLabel,
      hrv: randomInRange(30, 75),
      hrvTrend: randomFromArray(['improving', 'stable', 'declining'] as const),
      restingHeartRate: randomInRange(50, 70),
      sleepPerformance: randomInRange(70, 98),
    },
    strain: {
      score: strainScore,
      label: strainLabel,
      calories: randomInRange(1800, 3200),
      averageHeartRate: randomInRange(65, 85),
    },
    sleep: {
      hours: sleepHours,
      quality: sleepQuality,
      efficiency: randomInRange(75, 96),
      remSleep: randomFloat(1.2, 2.5, 1),
      deepSleep: randomFloat(1.0, 2.2, 1),
      disturbances: randomInRange(0, 5),
    },
    trends: {
      weeklyRecoveryAvg: randomInRange(55, 80),
      weeklyStrainAvg: randomFloat(8, 14, 1),
      weeklySleepAvg: randomFloat(6, 8, 1),
    },
  };
};

// Static version for backwards compatibility
export const DEMO_WHOOP_DATA = getDemoWhoopData();

export const DEMO_CALENDAR_DATA = {
  todayEvents: [
    {
      id: 'event-1',
      title: 'Team Standup',
      startTime: '09:00',
      endTime: '09:30',
      type: 'meeting',
      attendees: 5,
    },
    {
      id: 'event-2',
      title: 'Deep Work: Project Alpha',
      startTime: '10:00',
      endTime: '12:00',
      type: 'focus',
      attendees: 0,
    },
    {
      id: 'event-3',
      title: 'Client Presentation',
      startTime: '14:00',
      endTime: '15:00',
      type: 'presentation',
      attendees: 8,
    },
    {
      id: 'event-4',
      title: 'Gym Session',
      startTime: '18:00',
      endTime: '19:00',
      type: 'workout',
      attendees: 0,
    },
  ],
  upcomingEvents: [
    {
      id: 'event-5',
      title: 'Product Review',
      date: 'Tomorrow',
      time: '11:00',
      type: 'meeting',
    },
    {
      id: 'event-6',
      title: 'Interview: Senior Dev',
      date: 'Tomorrow',
      time: '15:00',
      type: 'interview',
    },
  ],
  patterns: {
    avgMeetingsPerDay: 3.2,
    focusTimePercentage: 45,
    busiestDay: 'Tuesday',
    preferredMeetingTime: '10am - 12pm',
  },
};

// Track name pools for variety
const TRACK_POOLS = [
  ['A Walk', 'Awake', 'Dive', 'Epoch', 'Coastal Brake'],
  ['The Less I Know The Better', 'Let It Happen', 'Borderline', 'Eventually', 'Feels Like We Only Go Backwards'],
  ['Kiara', 'Kerala', 'Sapphire', 'Flashlight', 'First Fires'],
  ['Says', 'Familiar', 'All Melody', 'My Friend the Forest', 'Spells'],
];

const GENRE_POOLS = [
  ['Ambient', 'Electronic', 'Lo-fi', 'Indie', 'Jazz'],
  ['Psychedelic Rock', 'Alternative', 'Synthwave', 'Dream Pop', 'Shoegaze'],
  ['Classical', 'Neo-Classical', 'Minimalist', 'Post-Rock', 'Ambient'],
  ['Funk', 'Soul', 'R&B', 'Disco', 'Electronic'],
];

const PEAK_HOURS = ['10pm - 2am', '8pm - 11pm', '6am - 9am', '2pm - 5pm', '9pm - 12am'];

// Dynamic Spotify data with randomization
export const getDemoSpotifyData = () => {
  const artistPool = randomFromArray(ARTIST_POOLS);
  const trackPool = randomFromArray(TRACK_POOLS);
  const genrePool = randomFromArray(GENRE_POOLS);

  return {
    topArtists: artistPool.map((artist, idx) => ({
      name: artist,
      plays: randomInRange(400, 900) - idx * 50,
      genre: genrePool[idx] || 'Electronic',
    })),
    topTracks: artistPool.map((artist, idx) => ({
      name: trackPool[idx] || `Track ${idx + 1}`,
      artist,
      plays: randomInRange(60, 150) - idx * 10,
    })),
    topGenres: genrePool.map((genre, idx) => ({
      genre,
      percentage: idx === 0 ? randomInRange(28, 38) : randomInRange(8, 22) - idx * 2,
    })),
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

export const DEMO_SOUL_SIGNATURE = {
  id: 'demo-soul-001',
  userId: 'demo-user-001',
  uniquenessScore: 87,
  authenticitScore: 92,
  extractionProgress: 100,
  lastUpdated: '2025-01-30T10:05:00Z',

  personality: {
    bigFive: {
      openness: 78,
      conscientiousness: 65,
      extraversion: 82,
      agreeableness: 71,
      neuroticism: 35,
    },
    traits: [
      { trait: 'Creative Explorer', strength: 88 },
      { trait: 'Balanced Achiever', strength: 85 },
      { trait: 'Social Connector', strength: 76 },
      { trait: 'Health Conscious', strength: 82 },
      { trait: 'Continuous Learner', strength: 89 },
    ],
  },

  interests: {
    primary: [
      { name: 'Electronic Music', intensity: 94 },
      { name: 'Fitness & Recovery', intensity: 87 },
      { name: 'Productivity', intensity: 82 },
      { name: 'Mindfulness', intensity: 78 },
    ],
    secondary: [
      { name: 'Ambient Soundscapes', intensity: 72 },
      { name: 'Work-Life Balance', intensity: 68 },
    ],
  },

  // Life clusters based on MVP platforms only
  lifeClusters: {
    personal: [
      {
        name: 'Musical Identity',
        revealLevel: 85,
        dataPoints: 2847,
        source: 'spotify',
        insights: [
          'Eclectic taste spanning lo-fi, synthwave, and ambient',
          'Creates themed playlists for different moods and activities',
          'Peak listening hours: late night (10pm-2am)',
          'Uses music to match energy levels throughout the day',
        ],
      },
      {
        name: 'Health & Recovery',
        revealLevel: 80,
        dataPoints: 730,
        source: 'whoop',
        insights: [
          'Average recovery score of 68% - room for improvement',
          'Sleep quality correlates strongly with next-day productivity',
          'Moderate daily strain suggests balanced activity level',
          'HRV trending stable - consistent stress management',
        ],
      },
    ],
    professional: [
      {
        name: 'Work Patterns',
        revealLevel: 90,
        dataPoints: 156,
        source: 'google_calendar',
        insights: [
          'Prefers morning focus time (10am-12pm)',
          'Average 3.2 meetings per day',
          'Tuesday is busiest day of the week',
          '45% of time blocked for deep work',
        ],
      },
    ],
  },
};

export const DEMO_INSIGHTS = [
  {
    id: 'insight-1',
    title: 'Recovery-Music Connection',
    description: 'On high recovery days (80%+), you tend to listen to more energetic music. Consider matching your playlist to your recovery score.',
    type: 'correlation',
    confidence: 89,
    icon: '🎵',
    platforms: ['whoop', 'spotify'],
  },
  {
    id: 'insight-2',
    title: 'Pre-Meeting Music',
    description: 'You often listen to ambient music 30 minutes before important meetings. This may help you prepare mentally.',
    type: 'behavioral',
    confidence: 92,
    icon: '📅',
    platforms: ['spotify', 'google_calendar'],
  },
  {
    id: 'insight-3',
    title: 'Sleep Impact',
    description: 'Your calendar shows 23% more meetings scheduled after nights with 7+ hours of sleep. Better rest = more social energy.',
    type: 'correlation',
    confidence: 85,
    icon: '😴',
    platforms: ['whoop', 'google_calendar'],
  },
  {
    id: 'insight-4',
    title: 'Focus Time Effectiveness',
    description: 'Your blocked focus time on calendar correlates with 40% longer Spotify listening sessions - deep work mode activated.',
    type: 'productivity',
    confidence: 91,
    icon: '🎯',
    platforms: ['google_calendar', 'spotify'],
  },
];

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
