export type InsightUrgency = 'high' | 'medium' | 'low';
export type InsightCategory =
  | 'trend' | 'anomaly' | 'celebration' | 'concern'
  | 'nudge' | 'goal_progress' | 'goal_suggestion';

export interface ProactiveInsight {
  id: string;
  insight: string;
  urgency: InsightUrgency;
  category: InsightCategory;
  created_at: string;
  delivered: boolean;
  engaged: boolean;
  nudge_action?: string | null;
  nudge_followed?: boolean | null;
}

export interface DashboardContext {
  greeting: {
    firstName: string;
    timeLabel: 'morning' | 'afternoon' | 'evening';
    insightCount: number;
    streak: number;
  };
  heroInsight: {
    body: string;
    source: string;
    insightId: string;
    createdAt: string;
  } | null;
  twinStats: {
    readiness: { score: number; label: string; trend: number };
    memoryCount: number;
    memoriesThisWeek: number;
    streak: number;
  };
  heatmap: Array<{ date: string; count: number }>;
  nextEvents: Array<{ title: string; startTime: string; endTime: string }>;
  platforms: Array<{
    name: string;
    provider: string;
    lastSync: string | null;
    status: 'active' | 'stale' | 'disconnected';
  }>;
}
