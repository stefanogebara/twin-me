/**
 * Demo Soul Signature Data
 * Soul signature and cross-platform insights for demo mode
 */

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
      { trait: 'Continuous Learner', strength: 89 },
    ],
  },

  interests: {
    primary: [
      { name: 'Electronic Music', intensity: 94 },
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
    id: 'insight-2',
    title: 'Pre-Meeting Music',
    description: 'You often listen to ambient music 30 minutes before important meetings. This may help you prepare mentally.',
    type: 'behavioral',
    confidence: 92,
    icon: '\uD83D\uDCC5',
    platforms: ['spotify', 'google_calendar'],
  },
  {
    id: 'insight-4',
    title: 'Focus Time Effectiveness',
    description: 'Your blocked focus time on calendar correlates with 40% longer Spotify listening sessions - deep work mode activated.',
    type: 'productivity',
    confidence: 91,
    icon: '\uD83C\uDFAF',
    platforms: ['google_calendar', 'spotify'],
  },
];
