/**
 * onboardingHelpers — Shared constants, utilities, and small UI primitives
 * for the InstantTwinOnboarding flow.
 */

export const NANGO_PROVIDER_MAP: Record<string, string> = {
  'linkedin': 'linkedin',
  'github': 'github-getting-started',
  'reddit': 'reddit',
  'spotify': 'spotify',
  'youtube': 'youtube',
  'google-calendar': 'google-calendar',
  'strava': 'strava',
  'fitbit': 'fitbit',
  'garmin': 'garmin',
  'twitch': 'twitch',
  'whoop': 'whoop',
  'oura': 'oura',
  'microsoft_outlook': 'outlook',
};

export const DEMO_CONNECTED_PROVIDERS = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin'];

export function formatPlatformName(platform: string): string {
  const names: Record<string, string> = {
    spotify: 'Spotify', youtube: 'YouTube', github: 'GitHub', discord: 'Discord',
    google_calendar: 'Google Calendar', linkedin: 'LinkedIn', reddit: 'Reddit',
    twitch: 'Twitch', whoop: 'WHOOP', gmail: 'Gmail', slack: 'Slack',
    strava: 'Strava', fitbit: 'Fitbit', garmin: 'Garmin', oura: 'Oura Ring',
  };
  return names[platform] || platform.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getDemoInsights(platform: string): { emoji: string; text: string }[] {
  const insights: Record<string, { emoji: string; text: string }[]> = {
    spotify: [
      { emoji: '🎵', text: 'Your top genres reveal your mood patterns — lo-fi for focus, hip-hop for energy' },
      { emoji: '🌙', text: 'Late-night listening spikes show when your creative brain turns on' },
      { emoji: '🔁', text: 'Artists you replay vs. discover tell us about your openness to new experiences' },
    ],
    google_calendar: [
      { emoji: '📅', text: 'Meeting density shows your social energy levels throughout the week' },
      { emoji: '⏰', text: 'Your free blocks reveal when you do your best deep work' },
      { emoji: '🔄', text: 'Schedule patterns predict burnout before you feel it' },
    ],
    youtube: [
      { emoji: '📺', text: 'Watch history reveals hidden curiosities you might not even notice' },
      { emoji: '🧠', text: 'Educational vs. entertainment ratio shows your learning drive' },
      { emoji: '🕐', text: 'Binge patterns correlate with stress or creative exploration' },
    ],
    discord: [
      { emoji: '💬', text: 'Server activity reveals your community interests and social style' },
      { emoji: '🎮', text: 'Gaming channels vs. learning channels map your leisure personality' },
      { emoji: '🤝', text: 'Active hours show when you seek connection vs. solitude' },
    ],
    github: [
      { emoji: '💻', text: 'Commit patterns reveal your coding rhythm — late-night builder or morning planner?' },
      { emoji: '🔧', text: 'Languages and frameworks show what problems excite you most' },
      { emoji: '⭐', text: 'Starred repos reveal your aspirational interests' },
    ],
    linkedin: [
      { emoji: '💼', text: 'Career trajectory shows whether you optimize for growth or stability' },
      { emoji: '🏢', text: 'Company choices reveal your values — startup energy or enterprise structure' },
      { emoji: '📊', text: 'Skills and endorsements map your professional identity' },
    ],
    reddit: [
      { emoji: '📱', text: 'Subreddit subscriptions are the most honest map of your interests' },
      { emoji: '💡', text: 'Comment patterns show what topics make you engage vs. lurk' },
      { emoji: '🔥', text: 'Upvote history reveals what genuinely resonates with you' },
    ],
    twitch: [
      { emoji: '🎮', text: 'Followed channels reveal your gaming identity and community belonging' },
      { emoji: '📺', text: 'Watch patterns show when you unwind vs. when you engage socially' },
      { emoji: '💬', text: 'Chat activity reveals how you interact in real-time communities' },
    ],
    whoop: [
      { emoji: '💪', text: 'Recovery scores correlate with your productivity and mood patterns' },
      { emoji: '😴', text: 'Sleep consistency reveals how you manage energy across the week' },
      { emoji: '📈', text: 'Strain trends show whether you push too hard or coast too long' },
    ],
    strava: [
      { emoji: '🏃', text: 'Training patterns reveal your discipline and how you push limits' },
      { emoji: '📍', text: 'Route choices show whether you explore or stick to routines' },
      { emoji: '⚡', text: 'Effort distribution reveals your relationship with challenge' },
    ],
    gmail: [
      { emoji: '📧', text: 'Response times reveal your communication priorities and energy' },
      { emoji: '🕸', text: 'Contact patterns map your real social network — who matters most' },
      { emoji: '📝', text: 'Writing style in emails reflects your personality more than you think' },
    ],
    slack: [
      { emoji: '💬', text: 'Channel activity shows where your professional curiosity lives' },
      { emoji: '⏰', text: 'Message timing reveals your work rhythm and availability patterns' },
      { emoji: '🤝', text: 'Reaction patterns show how you build relationships at work' },
    ],
  };
  return insights[platform] || [
    { emoji: '✨', text: 'Connect this platform to discover patterns about yourself you never noticed' },
    { emoji: '🔮', text: 'Your twin gets smarter with every data source you add' },
    { emoji: '🧩', text: 'Cross-platform insights are where the real magic happens' },
  ];
}
