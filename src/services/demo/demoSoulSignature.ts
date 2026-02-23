/**
 * Demo Soul Signature Data
 * Soul signature, cross-platform insights, and full twin portrait for demo mode
 */

import type { TwinPortraitData } from '../../pages/components/soul-portrait/types';

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

// Full TwinPortraitData shape used by the Soul Signature dashboard in demo mode
const TWO_WEEKS_AGO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
const THREE_HOURS_AGO = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

export const DEMO_TWIN_PORTRAIT: TwinPortraitData = {
  soulSignature: {
    archetype_name: 'The Creative Synthesizer',
    archetype_subtitle: 'Where curiosity meets craft',
    narrative:
      "Alex blends analytical depth with creative breadth — someone who processes the world through music, patterns, and intentional connection. " +
      "Your digital footprint reveals a person who is simultaneously structured and spontaneous: calendar blocks for deep work sit beside late-night lo-fi sessions and weekend deep dives into niche YouTube rabbit holes.",
    defining_traits: [
      { trait: 'Curious Generalist', source: 'youtube' },
      { trait: 'Rhythmic Thinker', source: 'spotify' },
      { trait: 'Intentional Planner', source: 'google_calendar' },
      { trait: 'Community Builder', source: 'discord' },
    ],
    created_at: TWO_WEEKS_AGO,
  },
  twinSummary: {
    summary:
      "Alex is a creative synthesizer who finds meaning at the intersection of music, technology, and human connection. " +
      "Your listening patterns show deep emotional intelligence — you use sound as a tool for focus, recovery, and self-expression. " +
      "The 45% of calendar time blocked for deep work reveals someone who guards their attention fiercely while remaining highly collaborative when present.",
    domains: {
      personality: "Highly open to new experiences with strong conscientiousness when it matters. Thrives in environments that blend structure with creative freedom.",
      lifestyle: "Morning focus blocks, late-night creative energy, and a consistent pattern of using music to modulate cognitive state throughout the day.",
      culturalIdentity: "Draws from electronic, ambient, and lo-fi traditions — aesthetic choices that signal a preference for immersive, textured experiences over passive consumption.",
      socialDynamics: "Active in niche Discord communities around shared interests. Prefers depth of connection over breadth — fewer, more meaningful relationships.",
      motivation: "Driven by mastery and novelty simultaneously. Sets ambitious goals but paces them with intentional recovery cycles.",
    },
    generatedAt: THREE_HOURS_AGO,
  },
  reflections: [
    {
      id: 'demo-reflection-1',
      content:
        "Alex's music selection follows a clear emotional regulation strategy: high-energy tracks during morning focus windows, ambient during deep work, lo-fi during transitions. " +
        "This is not random — it's a sophisticated self-management system expressed through playlist curation.",
      importance_score: 8,
      metadata: { expert: 'Personality Psychologist', domain: 'personality', depth: 1 },
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-reflection-2',
      content:
        "Calendar data reveals a 'meeting clustering' behavior — Alex bunches meetings into Tuesday/Thursday afternoons, preserving Monday, Wednesday, and Friday mornings for uninterrupted work. " +
        "This is a hallmark of someone who understands their own cognitive rhythms and architects their schedule accordingly.",
      importance_score: 9,
      metadata: { expert: 'Lifestyle Analyst', domain: 'lifestyle', depth: 1 },
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-reflection-3',
      content:
        "YouTube subscription patterns show an 80/20 split: 80% niche technical content (ML, audio engineering, productivity) versus 20% broader cultural content. " +
        "This person is a specialist who stays culturally literate — a rare and valuable combination.",
      importance_score: 7,
      metadata: { expert: 'Cultural Identity Expert', domain: 'culturalIdentity', depth: 1 },
      created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-reflection-4',
      content:
        "Discord server activity is concentrated in 3 communities: an audio engineering server, a productivity/systems thinking group, and a creative writing collective. " +
        "This triangle of interests — sound, systems, and story — forms the core of Alex's intellectual identity.",
      importance_score: 8,
      metadata: { expert: 'Social Dynamics Analyst', domain: 'socialDynamics', depth: 1 },
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  insights: [
    {
      id: 'demo-insight-1',
      insight: "Your Spotify listening dropped 40% in the last 3 days while your calendar meeting density increased. You might need a recovery block.",
      urgency: 'medium',
      category: 'trend',
      created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      delivered: false,
    },
    {
      id: 'demo-insight-2',
      insight: "You've watched 12 videos about audio engineering this week — twice your usual rate. Something's sparking here.",
      urgency: 'low',
      category: 'trend',
      created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      delivered: false,
    },
    {
      id: 'demo-insight-3',
      insight: "You hit your daily focus block goal 6 days in a row. Your best streak ever. Worth acknowledging.",
      urgency: 'low',
      category: 'celebration',
      created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      delivered: false,
    },
  ],
  memoryStats: {
    total: 2847 + 156 + 892 + 1243 + 47,
    byType: {
      fact: 412,
      reflection: 38,
      platform_data: 4,
      conversation: 127,
      observation: 4604,
    },
  },
  goals: [
    {
      id: 'demo-goal-1',
      user_id: '00000000-0000-0000-0000-000000000001',
      title: '30 min daily focus music',
      description: 'Listen to at least 30 minutes of focused/instrumental music each workday to support deep work sessions.',
      metric_type: 'minutes_listened',
      target_value: 30,
      status: 'active',
      duration_days: 30,
      total_days_tracked: 18,
      total_days_met: 15,
      current_streak: 6,
      start_date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  platformData: {
    spotify: {
      latestAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      recentObservations: [
        'Listened to 2h 14m of lo-fi focus music during morning work block',
        'Added 3 tracks to "Deep Work" playlist',
        'Artist discovery: Nils Frahm (classical/electronic crossover)',
      ],
    },
    google_calendar: {
      latestAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      recentObservations: [
        'Tuesday packed: 4 meetings between 2-6pm',
        'Morning focus blocks maintained M/W/F this week',
        '3 events marked as "Important" in the next 7 days',
      ],
    },
    youtube: {
      latestAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      recentObservations: [
        'Watched: "Building a Home Studio on a Budget" (47 min)',
        'New subscription: 3Blue1Brown (math visualization)',
        '12 videos this week in audio engineering category',
      ],
    },
    discord: {
      latestAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      recentObservations: [
        'Active in #audio-gear channel of Sound Design Collective',
        'Shared a link in #productivity server — 8 reactions',
        'Joined a new voice channel for a study-with-me session',
      ],
    },
    linkedin: {
      latestAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      recentObservations: [
        'Posted an article on focus workflows — 142 impressions',
        'Connected with 2 new people in audio tech space',
        'Endorsed for "Creative Problem Solving" by 3 connections',
      ],
    },
  },
  personalityScores: {
    openness: 78,
    conscientiousness: 65,
    extraversion: 52,
    agreeableness: 71,
    neuroticism: 35,
    archetype_code: 'CREATIVE_SYNTHESIZER',
    analyzed_platforms: ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin'],
    source_type: 'cross_platform',
  },
  connectedPlatforms: [
    { platform: 'spotify', status: 'active', last_sync_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { platform: 'google_calendar', status: 'active', last_sync_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
    { platform: 'youtube', status: 'active', last_sync_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    { platform: 'discord', status: 'active', last_sync_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
    { platform: 'linkedin', status: 'active', last_sync_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() },
  ],
  firstMemoryAt: TWO_WEEKS_AGO,
};
