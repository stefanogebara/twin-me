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
  id: 'demo-0000-0000-0000-000000000001',  // Must NOT match any real user UUID!
  email: 'alex.rivera@demo.com',
  firstName: 'Alex',
  lastName: 'Rivera',
  fullName: 'Alex Rivera',
  profileImageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AlexRivera',
};

// Helper to generate dynamic timestamps relative to now
const getRelativeDate = (hoursAgo: number): string => {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  return date.toISOString();
};

const getRelativeDateDays = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
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
  {
    id: 'demo-conn-whoop',
    platform: 'whoop',
    platformName: 'Whoop',
    connected: true,
    connectedAt: getRelativeDateDays(14), // Connected 14 days ago
    lastSync: getRelativeDate(3), // Synced 3 hours ago
    status: 'active',
    syncStatus: 'synced',
    dataQuality: 'high',
    dataPoints: 730,
    extractedDataPoints: 730,
  },
];

// Helper to format time for display
const formatTimeAgo = (hoursAgo: number): string => {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Get day name from days ago
const getDayName = (daysAgo: number): string => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return days[date.getDay()];
};

// Generate 7-day historical Whoop data
const generate7DayHistory = () => {
  const history = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    history.push({
      date: date.toISOString().split('T')[0],
      dayName: getDayName(i),
      recovery: randomInRange(35, 95),
      strain: randomFloat(5, 18, 1),
      sleepHours: randomFloat(5, 9, 1),
      hrv: randomInRange(25, 85),
    });
  }
  return history;
};

// Dynamic Whoop data with randomization and timestamps
export const getDemoWhoopData = () => {
  const recoveryScore = randomInRange(45, 95);
  const recoveryLabel = recoveryScore >= 80 ? 'Optimal' : recoveryScore >= 65 ? 'Good' : recoveryScore >= 50 ? 'Moderate' : 'Low';

  const strainScore = randomFloat(6, 18, 1);
  const strainLabel = strainScore >= 16 ? 'Very High' : strainScore >= 12 ? 'High' : strainScore >= 8 ? 'Moderate' : 'Light';

  const sleepHours = randomFloat(5.5, 9, 1);
  const sleepQuality = sleepHours >= 8 ? 'Excellent' : sleepHours >= 7 ? 'Good' : sleepHours >= 6 ? 'Fair' : 'Poor';

  const hrvValue = randomInRange(30, 75);
  const restingHR = randomInRange(50, 70);
  const sleepEfficiency = randomInRange(75, 96);
  const remSleep = randomFloat(1.2, 2.5, 1);
  const deepSleep = randomFloat(1.0, 2.2, 1);
  const lightSleep = Number((sleepHours - remSleep - deepSleep).toFixed(1));

  // Generate 7-day history
  const history7Day = generate7DayHistory();
  // Override today's data with current values
  history7Day[6] = {
    ...history7Day[6],
    recovery: recoveryScore,
    strain: strainScore,
    sleepHours: sleepHours,
    hrv: hrvValue,
  };

  return {
    recovery: {
      score: recoveryScore,
      label: recoveryLabel,
      hrv: hrvValue,
      hrvTrend: randomFromArray(['improving', 'stable', 'declining'] as const),
      restingHeartRate: restingHR,
      sleepPerformance: randomInRange(70, 98),
      // New: timestamps
      updatedAt: formatTimeAgo(randomFloat(0.5, 3, 1)),
      hrvUpdatedAt: formatTimeAgo(randomFloat(1, 4, 1)),
    },
    strain: {
      score: strainScore,
      label: strainLabel,
      calories: randomInRange(1800, 3200),
      averageHeartRate: randomInRange(65, 85),
      // New: live tracking indicator
      isLive: true,
    },
    sleep: {
      hours: sleepHours,
      quality: sleepQuality,
      efficiency: sleepEfficiency,
      remSleep: remSleep,
      deepSleep: deepSleep,
      lightSleep: lightSleep > 0 ? lightSleep : 0,
      disturbances: randomInRange(0, 5),
      // New: sleep timestamps
      bedtime: '11:15 PM',
      wakeTime: formatTimeAgo(randomFloat(1, 6, 1)),
    },
    trends: {
      weeklyRecoveryAvg: randomInRange(55, 80),
      weeklyStrainAvg: randomFloat(8, 14, 1),
      weeklySleepAvg: randomFloat(6, 8, 1),
    },
    // New: 7-day historical data for charts
    history7Day: history7Day,
    // New: today's timestamps
    timestamps: {
      recoveryCalculated: formatTimeAgo(randomFloat(0.5, 2, 1)),
      lastHRVReading: formatTimeAgo(randomFloat(1, 5, 1)),
      sleepEnded: formatTimeAgo(randomFloat(2, 8, 1)),
      strainUpdated: 'Live',
    },
  };
};

// Static version for backwards compatibility
export const DEMO_WHOOP_DATA = getDemoWhoopData();

// Generate event type distribution data (ensures sum = 100%)
const generateEventTypeDistribution = () => {
  // Generate raw values
  const rawMeeting = randomInRange(35, 50);
  const rawFocus = randomInRange(25, 35);
  const rawPresentation = randomInRange(8, 15);
  const rawPersonal = randomInRange(5, 15);

  // Calculate total and normalize to 100%
  const total = rawMeeting + rawFocus + rawPresentation + rawPersonal;
  const meetingPct = Math.round((rawMeeting / total) * 100);
  const focusPct = Math.round((rawFocus / total) * 100);
  const presentationPct = Math.round((rawPresentation / total) * 100);
  // Personal gets the remainder to ensure exact 100% total
  const personalPct = 100 - meetingPct - focusPct - presentationPct;

  return [
    { type: 'Meetings', percentage: meetingPct, color: '#4285F4' },
    { type: 'Focus Time', percentage: focusPct, color: '#34A853' },
    { type: 'Presentations', percentage: presentationPct, color: '#FBBC05' },
    { type: 'Personal', percentage: personalPct, color: '#EA4335' },
  ].sort((a, b) => b.percentage - a.percentage);
};

// Generate weekly busy hours for heatmap
const generateWeeklyHeatmap = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const timeSlots = ['8-10', '10-12', '12-2', '2-4', '4-6'];

  return days.map(day => ({
    day,
    slots: timeSlots.map(slot => ({
      slot,
      intensity: randomInRange(0, 3), // 0 = free, 1 = light, 2 = moderate, 3 = busy
    })),
  }));
};

export const DEMO_CALENDAR_DATA = {
  todayEvents: [
    {
      id: 'event-1',
      title: 'Team Standup',
      startTime: '09:00',
      endTime: '09:30',
      type: 'meeting',
      attendees: 5,
      isRecurring: true,
    },
    {
      id: 'event-2',
      title: 'Deep Work: Project Alpha',
      startTime: '10:00',
      endTime: '12:00',
      type: 'focus',
      attendees: 0,
      isRecurring: false,
    },
    {
      id: 'event-3',
      title: 'Client Presentation',
      startTime: '14:00',
      endTime: '15:00',
      type: 'presentation',
      attendees: 8,
      isRecurring: false,
    },
    {
      id: 'event-4',
      title: 'Gym Session',
      startTime: '18:00',
      endTime: '19:00',
      type: 'workout',
      attendees: 0,
      isRecurring: true,
    },
  ],
  upcomingEvents: [
    {
      id: 'event-5',
      title: 'Product Review',
      date: 'Tomorrow',
      time: '11:00',
      type: 'meeting',
      attendees: 4,
    },
    {
      id: 'event-6',
      title: 'Interview: Senior Dev',
      date: 'Tomorrow',
      time: '15:00',
      type: 'interview',
      attendees: 3,
    },
  ],
  patterns: {
    avgMeetingsPerDay: 3.2,
    focusTimePercentage: 45,
    busiestDay: 'Tuesday',
    preferredMeetingTime: '10am - 12pm',
  },
  eventTypeDistribution: generateEventTypeDistribution(),
  weeklyHeatmap: generateWeeklyHeatmap(),
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

// Generate timestamps for recent tracks
const generateRecentTrackTime = (index: number): string => {
  const now = new Date();
  // Each track is spaced ~2-4 hours apart
  const hoursAgo = index * randomFloat(2, 4, 1);
  now.setHours(now.getHours() - hoursAgo);

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const timeStr = `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  if (now.toDateString() === today.toDateString()) {
    return `${timeStr} today`;
  } else if (now.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${timeStr}`;
  } else {
    return `${now.toLocaleDateString('en-US', { weekday: 'short' })} ${timeStr}`;
  }
};

// Generate listening hours data for visualization
const generateListeningHours = (): Array<{ hour: number; plays: number }> => {
  const hours = [];
  for (let h = 6; h <= 23; h++) {
    // Peak hours around 9-10am and 8-10pm
    let basePlays = 5;
    if (h >= 9 && h <= 11) basePlays = 20 + randomInRange(5, 15);
    else if (h >= 19 && h <= 22) basePlays = 25 + randomInRange(5, 15);
    else if (h >= 14 && h <= 17) basePlays = 12 + randomInRange(3, 10);
    else basePlays = 5 + randomInRange(0, 8);

    hours.push({ hour: h, plays: basePlays });
  }
  return hours;
};

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

// =====================================================
// SOUL SIGNATURE DASHBOARD - Personality Scores
// =====================================================

export interface DemoPersonalityScores {
  id: string;
  mind?: number;
  energy?: number;
  nature?: number;
  tactics?: number;
  identity?: number;
  mind_ci?: number;
  energy_ci?: number;
  nature_ci?: number;
  tactics_ci?: number;
  identity_ci?: number;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  openness_confidence: number;
  conscientiousness_confidence: number;
  extraversion_confidence: number;
  agreeableness_confidence: number;
  neuroticism_confidence: number;
  archetype_code?: string;
  analyzed_platforms: string[];
  sample_size: number;
}

export const DEMO_PERSONALITY_SCORES: DemoPersonalityScores = {
  id: 'demo-scores',
  mind: 72,
  energy: 78,
  nature: 45,
  tactics: 65,
  identity: 68,
  mind_ci: 12,
  energy_ci: 15,
  nature_ci: 18,
  tactics_ci: 14,
  identity_ci: 16,
  archetype_code: 'ENTJ-A',
  openness: 78,
  conscientiousness: 65,
  extraversion: 72,
  agreeableness: 45,
  neuroticism: 32,
  openness_confidence: 85,
  conscientiousness_confidence: 86,
  extraversion_confidence: 88,
  agreeableness_confidence: 82,
  neuroticism_confidence: 84,
  analyzed_platforms: ['spotify', 'google_calendar', 'whoop'],
  sample_size: 47
};

// =====================================================
// SOUL SIGNATURE DASHBOARD - Archetype (different from DEMO_SOUL_SIGNATURE)
// =====================================================

export interface DemoSoulArchetype {
  id: string;
  archetype_name: string;
  archetype_subtitle: string;
  narrative: string;
  defining_traits: Array<{
    trait: string;
    score: number;
    evidence: string;
  }>;
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  icon_type: string;
}

export const DEMO_SOUL_ARCHETYPE: DemoSoulArchetype = {
  id: 'demo-signature',
  archetype_name: 'The Creative Explorer',
  archetype_subtitle: 'Curious mind with a passion for discovery',
  narrative: 'You are driven by an insatiable curiosity and a desire to understand the world around you. Your eclectic taste in music and content reveals a mind that thrives on variety and novelty. You connect deeply with others while maintaining your unique perspective, making you both relatable and distinctively original.',
  defining_traits: [
    { trait: 'Intellectual Curiosity', score: 92, evidence: 'Diverse music genres in Spotify history' },
    { trait: 'Work-Life Balance', score: 78, evidence: 'Healthy mix of meetings and focus time' },
    { trait: 'Health Conscious', score: 85, evidence: 'Consistent recovery tracking on Whoop' },
    { trait: 'Emotional Depth', score: 74, evidence: 'Music choices reflect mood awareness' }
  ],
  color_scheme: {
    primary: '#C1C0B6',
    secondary: '#A8A79E',
    accent: '#D4D3CC',
    background: '#2D2D29',
    text: '#C1C0B6'
  },
  icon_type: 'compass'
};

// =====================================================
// SOUL SIGNATURE DASHBOARD - Behavioral Features
// =====================================================

export interface DemoBehavioralFeature {
  id: string;
  platform: string;
  feature_type: string;
  feature_value: number;
  contributes_to: string;
  confidence_score: number;
}

export const DEMO_BEHAVIORAL_FEATURES: DemoBehavioralFeature[] = [
  { id: 'f1', platform: 'spotify', feature_type: 'music_diversity', feature_value: 85, contributes_to: 'openness', confidence_score: 90 },
  { id: 'f2', platform: 'google_calendar', feature_type: 'focus_time_ratio', feature_value: 67, contributes_to: 'conscientiousness', confidence_score: 78 },
  { id: 'f3', platform: 'whoop', feature_type: 'recovery_consistency', feature_value: 72, contributes_to: 'neuroticism', confidence_score: 82 },
  { id: 'f4', platform: 'google_calendar', feature_type: 'social_events_ratio', feature_value: 68, contributes_to: 'extraversion', confidence_score: 85 }
];

// =====================================================
// PERSONALITY ASSESSMENT - MBTI Questions
// =====================================================

export interface DemoMBTIQuestion {
  id: string;
  dimension: string;
  facet: string;
  question: string;
  order: number;
}

export const DEMO_MBTI_QUESTIONS: DemoMBTIQuestion[] = [
  // Mind (I/E) - 3 questions
  { id: 'IE1', dimension: 'mind', facet: 'social_energy', question: 'I feel energized after spending time with a large group of people.', order: 1 },
  { id: 'IE2', dimension: 'mind', facet: 'social_preference', question: 'I prefer working in teams rather than alone.', order: 2 },
  { id: 'IE3', dimension: 'mind', facet: 'external_processing', question: 'I often think out loud and process ideas by talking to others.', order: 3 },
  // Energy (S/N) - 3 questions
  { id: 'SN1', dimension: 'energy', facet: 'abstract_thinking', question: 'I enjoy exploring abstract theories and hidden meanings.', order: 4 },
  { id: 'SN2', dimension: 'energy', facet: 'future_focus', question: 'I spend more time thinking about future possibilities than past experiences.', order: 5 },
  { id: 'SN3', dimension: 'energy', facet: 'pattern_recognition', question: 'I often notice patterns and connections that others might miss.', order: 6 },
  // Nature (T/F) - 3 questions
  { id: 'TF1', dimension: 'nature', facet: 'decision_logic', question: 'When making decisions, I prioritize logic over people\'s feelings.', order: 7 },
  { id: 'TF2', dimension: 'nature', facet: 'objectivity', question: 'I believe being objective is more important than being tactful.', order: 8 },
  { id: 'TF3', dimension: 'nature', facet: 'criticism', question: 'I can easily give critical feedback without worrying about hurting feelings.', order: 9 },
  // Tactics (J/P) - 3 questions
  { id: 'JP1', dimension: 'tactics', facet: 'planning', question: 'I prefer having a detailed plan before starting a project.', order: 10 },
  { id: 'JP2', dimension: 'tactics', facet: 'structure', question: 'I feel most comfortable when I have a clear schedule and routine.', order: 11 },
  { id: 'JP3', dimension: 'tactics', facet: 'closure', question: 'I like to complete tasks well before deadlines.', order: 12 },
  // Identity (A/T) - 3 questions
  { id: 'AT1', dimension: 'identity', facet: 'self_assurance', question: 'I rarely worry about how others perceive me.', order: 13 },
  { id: 'AT2', dimension: 'identity', facet: 'stress_response', question: 'I handle stressful situations calmly without much anxiety.', order: 14 },
  { id: 'AT3', dimension: 'identity', facet: 'confidence', question: 'I feel confident in my abilities even when facing new challenges.', order: 15 },
];

// MBTI Archetype definitions
export const MBTI_ARCHETYPES: Record<string, { name: string; title: string; description: string }> = {
  'INTJ': { name: 'The Architect', title: 'Strategic and Independent Thinker', description: 'Architects are imaginative and strategic thinkers with a plan for everything. They value intelligence and competence, and typically have high standards for themselves and others.' },
  'INTP': { name: 'The Logician', title: 'Innovative Inventor', description: 'Logicians are innovative inventors with an unquenchable thirst for knowledge. They love to analyze theories and ideas, searching for the truth.' },
  'ENTJ': { name: 'The Commander', title: 'Bold and Imaginative Leader', description: 'Commanders are bold, imaginative and strong-willed leaders, always finding a way – or making one. They are strategic thinkers with clear visions.' },
  'ENTP': { name: 'The Debater', title: 'Smart and Curious Thinker', description: 'Debaters are smart and curious thinkers who cannot resist an intellectual challenge. They love to challenge conventions and find new solutions.' },
  'INFJ': { name: 'The Advocate', title: 'Quiet and Mystical Idealist', description: 'Advocates are quiet and mystical, yet very inspiring and tireless idealists. They are principled and dedicated to helping others.' },
  'INFP': { name: 'The Mediator', title: 'Poetic and Kind Idealist', description: 'Mediators are poetic, kind and altruistic people, always eager to help a good cause. They are guided by principles rather than logic.' },
  'ENFJ': { name: 'The Protagonist', title: 'Charismatic and Inspiring Leader', description: 'Protagonists are charismatic and inspiring leaders, able to mesmerize their listeners. They are natural teachers who are passionate about helping others grow.' },
  'ENFP': { name: 'The Campaigner', title: 'Enthusiastic and Creative Free Spirit', description: 'Campaigners are enthusiastic, creative and sociable free spirits, who can always find a reason to smile. They see life as full of possibilities.' },
  'ISTJ': { name: 'The Logistician', title: 'Practical and Fact-minded', description: 'Logisticians are practical and fact-minded individuals, whose reliability cannot be doubted. They take responsibility and honor their commitments.' },
  'ISFJ': { name: 'The Defender', title: 'Dedicated and Warm Protector', description: 'Defenders are very dedicated and warm protectors, always ready to defend their loved ones. They are supportive and reliable.' },
  'ESTJ': { name: 'The Executive', title: 'Excellent Administrator', description: 'Executives are excellent administrators, unsurpassed at managing things and people. They have a clear vision of how things should be done.' },
  'ESFJ': { name: 'The Consul', title: 'Caring and Social Caretaker', description: 'Consuls are extraordinarily caring, social and popular people, always eager to help. They value tradition and are very loyal.' },
  'ISTP': { name: 'The Virtuoso', title: 'Bold and Practical Experimenter', description: 'Virtuosos are bold and practical experimenters, masters of all kinds of tools. They are highly practical and enjoy exploring with their hands.' },
  'ISFP': { name: 'The Adventurer', title: 'Flexible and Charming Artist', description: 'Adventurers are flexible and charming artists, always ready to explore and experience something new. They live in the moment.' },
  'ESTP': { name: 'The Entrepreneur', title: 'Smart and Energetic Perceiver', description: 'Entrepreneurs are smart, energetic and very perceptive people, who truly enjoy living on the edge. They love being the center of attention.' },
  'ESFP': { name: 'The Entertainer', title: 'Spontaneous and Energetic Entertainer', description: 'Entertainers are spontaneous, energetic and enthusiastic people – life is never boring around them. They love to be the life of the party.' },
};

// Generate demo personality result from responses
export function generateDemoPersonalityResult(responses: Map<string, number>) {
  const dimensionScores: Record<string, number[]> = {
    mind: [],
    energy: [],
    nature: [],
    tactics: [],
    identity: [],
  };

  responses.forEach((value, questionId) => {
    const question = DEMO_MBTI_QUESTIONS.find(q => q.id === questionId);
    if (question && dimensionScores[question.dimension]) {
      const normalizedScore = ((value - 1) / 6) * 100;
      dimensionScores[question.dimension].push(normalizedScore);
    }
  });

  const scores = {
    extraversion: dimensionScores.mind.length > 0
      ? dimensionScores.mind.reduce((a, b) => a + b, 0) / dimensionScores.mind.length
      : 50,
    openness: dimensionScores.energy.length > 0
      ? dimensionScores.energy.reduce((a, b) => a + b, 0) / dimensionScores.energy.length
      : 50,
    agreeableness: 100 - (dimensionScores.nature.length > 0
      ? dimensionScores.nature.reduce((a, b) => a + b, 0) / dimensionScores.nature.length
      : 50),
    conscientiousness: dimensionScores.tactics.length > 0
      ? dimensionScores.tactics.reduce((a, b) => a + b, 0) / dimensionScores.tactics.length
      : 50,
    neuroticism: 100 - (dimensionScores.identity.length > 0
      ? dimensionScores.identity.reduce((a, b) => a + b, 0) / dimensionScores.identity.length
      : 50),
  };

  const letters = {
    e: scores.extraversion >= 50 ? 'E' : 'I',
    n: scores.openness >= 50 ? 'N' : 'S',
    f: scores.agreeableness >= 50 ? 'F' : 'T',
    j: scores.conscientiousness >= 50 ? 'J' : 'P',
    identity: scores.neuroticism < 50 ? 'A' : 'T',
  };

  const code = `${letters.e}${letters.n}${letters.f}${letters.j}`;
  const fullCode = `${code}-${letters.identity}`;
  const archetype = MBTI_ARCHETYPES[code] || { name: 'The Explorer', title: 'Unique Individual', description: 'Your personality defies easy categorization.' };

  return {
    scores,
    archetype: {
      code,
      fullCode,
      name: archetype.name,
      title: archetype.title,
      description: archetype.description,
      identity: letters.identity,
      identityLabel: letters.identity === 'A' ? 'Assertive' : 'Turbulent',
    },
    insights: {
      strengths: [
        scores.extraversion >= 50 ? 'Natural ability to connect with others and energize teams' : 'Deep focus and ability to work independently',
        scores.openness >= 50 ? 'Creative thinking and openness to new ideas' : 'Practical approach and attention to concrete details',
        scores.conscientiousness >= 50 ? 'Strong organizational skills and reliability' : 'Flexibility and adaptability to change',
      ],
      growthAreas: [
        scores.extraversion >= 50 ? 'Practice quiet reflection and solo activities' : 'Challenge yourself to engage more in group settings',
        scores.neuroticism >= 50 ? 'Develop stress management techniques' : 'Stay connected to your emotional responses',
      ],
      summary: `As ${archetype.name}, you bring unique strengths to your interactions and work style. Your ${letters.identity === 'A' ? 'assertive' : 'turbulent'} identity means you ${letters.identity === 'A' ? 'approach challenges with confidence' : 'continuously strive for self-improvement'}.`,
    },
    questionsAnswered: responses.size,
    totalQuestions: 60,
    completionPercentage: Math.round((responses.size / 60) * 100),
  };
}

// =====================================================
// TODAY'S INSIGHTS - Daily actionable insights
// =====================================================

export interface DemoTodayInsight {
  id: string;
  type: 'health' | 'schedule' | 'music' | 'recommendation' | 'pattern';
  title: string;
  summary: string;
  detail?: string;
  platforms: string[];
  priority: 'high' | 'medium' | 'low';
  action?: {
    label: string;
    route?: string;
  };
  icon: 'activity' | 'calendar' | 'music' | 'zap' | 'moon' | 'sun' | 'heart' | 'trending';
}

export const DEMO_TODAY_INSIGHTS: DemoTodayInsight[] = [
  {
    id: 'demo-1',
    type: 'health',
    title: 'Good Recovery Day',
    summary: 'Your recovery is at 72% - perfect for moderate activity',
    detail: 'Based on your Whoop data, your HRV is above average and you got 7.2 hours of sleep. Consider a workout today.',
    platforms: ['whoop'],
    priority: 'high',
    icon: 'activity',
    action: { label: 'View Health Data', route: '/soul-signature' }
  },
  {
    id: 'demo-2',
    type: 'schedule',
    title: 'Your Day Ahead',
    summary: 'Check your calendar to see upcoming events',
    detail: 'Connect Google Calendar to get personalized insights about your schedule. We\'ll analyze your meeting patterns and suggest optimal prep times.',
    platforms: ['google_calendar'],
    priority: 'high',
    icon: 'calendar',
    action: { label: 'View Time Patterns', route: '/insights/calendar' }
  },
  {
    id: 'demo-3',
    type: 'music',
    title: 'Morning Focus Playlist',
    summary: 'Based on your listening, ambient music helps you focus',
    detail: 'Your recent Spotify history shows you listen to lo-fi and ambient tracks during work hours. This correlates with your most productive calendar blocks.',
    platforms: ['spotify', 'google_calendar'],
    priority: 'medium',
    icon: 'music',
    action: { label: 'View Music Insights', route: '/insights/spotify' }
  },
  {
    id: 'demo-4',
    type: 'pattern',
    title: 'Energy Pattern Detected',
    summary: 'You tend to crash around 3pm - schedule important work earlier',
    detail: 'Cross-referencing your Whoop strain data with calendar events shows your energy dips mid-afternoon. Your high-recovery days correlate with morning workouts.',
    platforms: ['whoop', 'google_calendar', 'spotify'],
    priority: 'medium',
    icon: 'trending'
  }
];

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
