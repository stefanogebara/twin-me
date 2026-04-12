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

export function getDemoInsights(platform: string): string[] {
  const insights: Record<string, string[]> = {
    spotify: [
      'Your top genres reveal your mood patterns — lo-fi for focus, hip-hop for energy',
      'Late-night listening spikes show when your creative brain turns on',
      'Artists you replay vs. discover tell us about your openness to new experiences',
    ],
    google_calendar: [
      'Meeting density shows your social energy levels throughout the week',
      'Your free blocks reveal when you do your best deep work',
      'Schedule patterns predict burnout before you feel it',
    ],
    youtube: [
      'Watch history reveals hidden curiosities you might not even notice',
      'Educational vs. entertainment ratio shows your learning drive',
      'Binge patterns correlate with stress or creative exploration',
    ],
    discord: [
      'Server activity reveals your community interests and social style',
      'Gaming channels vs. learning channels map your leisure personality',
      'Active hours show when you seek connection vs. solitude',
    ],
    github: [
      'Commit patterns reveal your coding rhythm — late-night builder or morning planner?',
      'Languages and frameworks show what problems excite you most',
      'Starred repos reveal your aspirational interests',
    ],
    linkedin: [
      'Career trajectory shows whether you optimize for growth or stability',
      'Company choices reveal your values — startup energy or enterprise structure',
      'Skills and endorsements map your professional identity',
    ],
    reddit: [
      'Subreddit subscriptions are the most honest map of your interests',
      'Comment patterns show what topics make you engage vs. lurk',
      'Upvote history reveals what genuinely resonates with you',
    ],
    twitch: [
      'Followed channels reveal your gaming identity and community belonging',
      'Watch patterns show when you unwind vs. when you engage socially',
      'Chat activity reveals how you interact in real-time communities',
    ],
    whoop: [
      'Recovery scores correlate with your productivity and mood patterns',
      'Sleep consistency reveals how you manage energy across the week',
      'Strain trends show whether you push too hard or coast too long',
    ],
    strava: [
      'Training patterns reveal your discipline and how you push limits',
      'Route choices show whether you explore or stick to routines',
      'Effort distribution reveals your relationship with challenge',
    ],
    gmail: [
      'Response times reveal your communication priorities and energy',
      'Contact patterns map your real social network — who matters most',
      'Writing style in emails reflects your personality more than you think',
    ],
    slack: [
      'Channel activity shows where your professional curiosity lives',
      'Message timing reveals your work rhythm and availability patterns',
      'Reaction patterns show how you build relationships at work',
    ],
  };
  return insights[platform] || [
    'Connect this platform to discover patterns about yourself you never noticed',
    'Your twin gets smarter with every data source you add',
    'Cross-platform insights are where the real magic happens',
  ];
}
