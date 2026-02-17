/**
 * Demo Today Insights Data
 * Daily actionable insights for demo mode
 */

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
