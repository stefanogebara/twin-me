/**
 * Whoop Insights Page
 *
 * "Body Stories" - Conversational reflections from your twin
 * about what your body's patterns reveal about you.
 *
 * NO stats. NO percentages. Just wisdom about your physiology.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation, StatCard, DataHighlight } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Activity, RefreshCw, Sparkles, ArrowLeft, AlertCircle, Heart, Zap, Moon, TrendingUp, Clock, Gauge, Droplets, Thermometer, Wind, Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDemoWhoopData } from '@/services/demoDataService';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip as RechartsTooltip, AreaChart, Area } from 'recharts';

interface Reflection {
  id: string | null;
  text: string;
  generatedAt: string;
  expiresAt: string | null;
  confidence: 'high' | 'medium' | 'low';
  themes: string[];
}

interface Pattern {
  id: string;
  text: string;
  occurrences: 'often' | 'sometimes' | 'noticed';
}

interface HistoryItem {
  id: string;
  text: string;
  generatedAt: string;
}

interface EvidenceItem {
  id: string;
  observation: string;
  dataPoints: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface CrossPlatformContext {
  lifeContext?: {
    isOnVacation?: boolean;
    vacationTitle?: string;
    daysRemaining?: number;
  };
  recovery?: number;
  calendarDensity?: string;
}

interface BodyMetrics {
  recovery?: number;
  strain?: number;
  sleepPerformance?: number;
  hrv?: number;
  restingHR?: number;
  recoveryUpdatedAt?: string;
  hrvUpdatedAt?: string;
  strainUpdatedAt?: string;
  // New metrics
  spo2?: number;
  skinTemp?: number;
  respiratoryRate?: number;
  sleepDisturbances?: number;
  stressLevel?: 'Low' | 'Moderate' | 'High' | 'Very High';
}

interface SleepStats {
  avgSleepHours?: string;
  sleepConsistency?: string;
  bestSleepDay?: string;
}

interface SleepBreakdown {
  deepSleep: number;
  remSleep: number;
  lightSleep: number;
  totalHours: number;
  efficiency: number;
  wakeTime?: string;
}

interface DayHistory {
  date: string;
  dayName: string;
  recovery: number;
  strain: number;
  sleepHours: number;
  hrv: number;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  crossPlatformContext?: CrossPlatformContext;
  // New: Specific data for visual display
  currentMetrics?: BodyMetrics;
  recentTrends?: string[];
  sleepStats?: SleepStats;
  sleepBreakdown?: SleepBreakdown;
  history7Day?: DayHistory[];
  error?: string;
}

const WhoopInsightsPage: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Theme colors
  const colors = {
    text: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e',
    whoopTeal: '#00B4D8',
    whoopBg: theme === 'dark' ? 'rgba(0, 180, 216, 0.15)' : 'rgba(0, 180, 216, 0.1)'
  };

  // Generate demo insights data
  const getDemoInsights = (): InsightsResponse => {
    const whoopData = getDemoWhoopData();
    return {
      success: true,
      reflection: {
        id: 'demo-reflection-1',
        text: `Your body tells a story of ${whoopData.recovery.label.toLowerCase()} recovery today. With a ${whoopData.recovery.score}% recovery score and HRV at ${whoopData.recovery.hrv}ms, your twin notices you're ${whoopData.recovery.score >= 70 ? 'ready to push yourself' : whoopData.recovery.score >= 50 ? 'capable of moderate activity' : 'signaling for rest'}. Your sleep last night was ${whoopData.sleep.quality.toLowerCase()} at ${whoopData.sleep.hours} hours - ${whoopData.sleep.hours >= 7 ? 'your body thanks you' : 'consider prioritizing rest tonight'}.`,
        generatedAt: new Date().toISOString(),
        expiresAt: null,
        confidence: 'high',
        themes: ['recovery', 'sleep', 'readiness'],
      },
      patterns: [
        {
          id: 'pattern-1',
          text: `Your HRV has been ${whoopData.recovery.hrvTrend} lately - ${whoopData.recovery.hrvTrend === 'improving' ? 'great sign of adaptation!' : whoopData.recovery.hrvTrend === 'stable' ? 'consistent stress management.' : 'consider more recovery time.'}`,
          occurrences: 'often',
        },
        {
          id: 'pattern-2',
          text: `You average ${whoopData.trends.weeklyRecoveryAvg}% recovery this week - ${whoopData.trends.weeklyRecoveryAvg >= 65 ? 'you\'re managing your load well' : 'your body might benefit from lighter days'}.`,
          occurrences: 'sometimes',
        },
        {
          id: 'pattern-3',
          text: `Your weekly sleep average is ${whoopData.trends.weeklySleepAvg} hours. ${whoopData.trends.weeklySleepAvg >= 7 ? 'Sleep consistency is your superpower!' : 'More consistent sleep could boost your recovery.'}`,
          occurrences: 'noticed',
        },
      ],
      history: [
        {
          id: 'history-1',
          text: 'Your recovery tends to be higher on days following lighter strain scores. Your body responds well to intentional recovery.',
          generatedAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      evidence: [
        {
          id: 'evidence-1',
          observation: `Resting heart rate at ${whoopData.recovery.restingHeartRate} BPM`,
          dataPoints: [`HRV: ${whoopData.recovery.hrv}ms`, `Sleep efficiency: ${whoopData.sleep.efficiency}%`],
          confidence: 'high',
        },
      ],
      currentMetrics: {
        recovery: whoopData.recovery.score,
        strain: whoopData.strain.score,
        sleepPerformance: whoopData.recovery.sleepPerformance,
        hrv: whoopData.recovery.hrv,
        restingHR: whoopData.recovery.restingHeartRate,
        recoveryUpdatedAt: whoopData.recovery.updatedAt,
        hrvUpdatedAt: whoopData.recovery.hrvUpdatedAt,
        strainUpdatedAt: whoopData.strain.isLive ? 'Live' : undefined,
        // New metrics (demo data)
        spo2: 97 + Math.floor(Math.random() * 3), // 97-99%
        skinTemp: 36.2 + (Math.random() * 0.6 - 0.3), // 35.9-36.5°C
        respiratoryRate: 13 + Math.floor(Math.random() * 4), // 13-16 breaths/min
        sleepDisturbances: Math.floor(Math.random() * 5), // 0-4 disturbances
        stressLevel: whoopData.recovery.score >= 67 ? 'Low' : whoopData.recovery.score >= 50 ? 'Moderate' : whoopData.recovery.score >= 34 ? 'High' : 'Very High',
      },
      recentTrends: [
        `${whoopData.recovery.label} recovery zone`,
        `${whoopData.strain.label} daily strain`,
        `${whoopData.sleep.quality} sleep quality`,
        `HRV ${whoopData.recovery.hrvTrend}`,
      ],
      sleepStats: {
        avgSleepHours: `${whoopData.trends.weeklySleepAvg}h`,
        sleepConsistency: whoopData.sleep.efficiency >= 85 ? 'High' : whoopData.sleep.efficiency >= 70 ? 'Moderate' : 'Low',
        bestSleepDay: 'Sunday',
      },
      sleepBreakdown: {
        deepSleep: whoopData.sleep.deepSleep,
        remSleep: whoopData.sleep.remSleep,
        lightSleep: whoopData.sleep.lightSleep,
        totalHours: whoopData.sleep.hours,
        efficiency: whoopData.sleep.efficiency,
        wakeTime: whoopData.sleep.wakeTime,
      },
      history7Day: whoopData.history7Day,
    };
  };

  useEffect(() => {
    fetchInsights();
  }, [isDemoMode]);

  const fetchInsights = async () => {
    // Handle demo mode - return demo data
    if (isDemoMode) {
      setInsights(getDemoInsights());
      setLoading(false);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Please sign in to hear your body stories');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/insights/whoop`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const data = await response.json();

      if (data.success) {
        setInsights(data);
        setError(null);
      } else {
        setError(data.error || 'Failed to load insights');
      }
    } catch (err) {
      console.error('Failed to fetch Whoop insights:', err);
      setError('Unable to connect to your body stories right now');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    // In demo mode, just regenerate demo data
    if (isDemoMode) {
      setTimeout(() => {
        setInsights(getDemoInsights());
        setRefreshing(false);
      }, 800);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');

    try {
      await fetch(`${API_BASE}/insights/whoop/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      await fetchInsights();
    } catch (err) {
      console.error('Failed to refresh insights:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <RefreshCw
            className="w-8 h-8 animate-spin"
            style={{ color: colors.text }}
          />
          <p style={{ color: colors.textSecondary }}>
            Reading your body's stories...
          </p>
        </div>
      </PageLayout>
    );
  }

  // Check if it's a token expiration error
  const isTokenExpired = error?.toLowerCase().includes('expired') ||
                          error?.toLowerCase().includes('reconnect') ||
                          error?.toLowerCase().includes('authentication');

  // Error state - with improved UX for token expiration
  if (error) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 px-4">
          {/* Icon with status indicator */}
          <div className="relative">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: isTokenExpired
                  ? theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'
                  : colors.whoopBg
              }}
            >
              <Activity
                className="w-10 h-10"
                style={{ color: isTokenExpired ? '#ef4444' : colors.whoopTeal }}
              />
            </div>
            {isTokenExpired && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-white" />
              </div>
            )}
          </div>

          {/* Title */}
          <h2
            className="text-xl font-medium text-center"
            style={{ color: colors.text }}
          >
            {isTokenExpired ? 'Whoop Connection Expired' : 'Unable to Load Body Stories'}
          </h2>

          {/* Description */}
          <p
            className="text-center max-w-md"
            style={{ color: colors.textSecondary }}
          >
            {isTokenExpired
              ? 'Your Whoop connection needs to be refreshed. This happens periodically for security. Reconnecting takes just a few seconds.'
              : error}
          </p>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate('/get-started')}
              className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-105"
              style={{
                backgroundColor: colors.whoopTeal,
                color: '#ffffff'
              }}
            >
              {isTokenExpired ? 'Reconnect Whoop' : 'Connect Whoop'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 rounded-xl font-medium transition-colors"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                color: colors.text
              }}
            >
              Back to Dashboard
            </button>
          </div>

          {/* Help text for token expiration */}
          {isTokenExpired && (
            <p
              className="text-xs text-center max-w-sm"
              style={{ color: colors.textSecondary }}
            >
              Tip: Your data is safe. After reconnecting, your body stories will continue from where you left off.
            </p>
          )}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          {/* Back Button */}
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg glass-button"
          >
            <ArrowLeft className="w-5 h-5" style={{ color: colors.text }} />
          </button>

          {/* Platform Icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: colors.whoopBg }}
          >
            <Activity className="w-6 h-6" style={{ color: colors.whoopTeal }} />
          </div>

          {/* Title */}
          <div>
            <h1
              className="text-2xl"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                color: colors.text
              }}
            >
              Body Stories
            </h1>
            <p
              className="text-sm"
              style={{ color: colors.textSecondary }}
            >
              What your body tells you
            </p>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg glass-button"
          title="Get a fresh observation"
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
            style={{ color: colors.text }}
          />
        </button>
      </div>

      {/* Expanded Metrics Grid with Timestamps */}
      {insights?.currentMetrics && (
        <div className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {/* Recovery */}
            <GlassPanel className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-4 h-4" style={{ color: colors.whoopTeal }} />
                <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                  Recovery
                </span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-medium" style={{ color: colors.text }}>
                  {insights.currentMetrics.recovery}%
                </span>
                <span className="text-xs mb-1" style={{
                  color: insights.currentMetrics.recovery! >= 67 ? '#4ade80' :
                    insights.currentMetrics.recovery! >= 34 ? '#fbbf24' : '#f87171'
                }}>
                  {insights.currentMetrics.recovery! >= 67 ? 'Green' :
                    insights.currentMetrics.recovery! >= 34 ? 'Yellow' : 'Red'}
                </span>
              </div>
              {insights.currentMetrics.recoveryUpdatedAt && (
                <div className="flex items-center gap-1 mt-2">
                  <Clock className="w-3 h-3" style={{ color: colors.textSecondary }} />
                  <span className="text-xs" style={{ color: colors.textSecondary }}>
                    {insights.currentMetrics.recoveryUpdatedAt}
                  </span>
                </div>
              )}
            </GlassPanel>

            {/* Strain */}
            <GlassPanel className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4" style={{ color: '#fbbf24' }} />
                <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                  Strain
                </span>
              </div>
              <div className="text-2xl font-medium" style={{ color: colors.text }}>
                {insights.currentMetrics.strain?.toFixed(1)}
              </div>
              {insights.currentMetrics.strainUpdatedAt && (
                <div className="flex items-center gap-1 mt-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs" style={{ color: '#4ade80' }}>
                    {insights.currentMetrics.strainUpdatedAt}
                  </span>
                </div>
              )}
            </GlassPanel>

            {/* HRV */}
            <GlassPanel className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4" style={{ color: '#a78bfa' }} />
                <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                  HRV
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-medium" style={{ color: colors.text }}>
                  {insights.currentMetrics.hrv}
                </span>
                <span className="text-sm" style={{ color: colors.textSecondary }}>ms</span>
              </div>
              {insights.currentMetrics.hrvUpdatedAt && (
                <div className="flex items-center gap-1 mt-2">
                  <Clock className="w-3 h-3" style={{ color: colors.textSecondary }} />
                  <span className="text-xs" style={{ color: colors.textSecondary }}>
                    {insights.currentMetrics.hrvUpdatedAt}
                  </span>
                </div>
              )}
            </GlassPanel>

            {/* Resting HR */}
            <GlassPanel className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="w-4 h-4" style={{ color: '#f472b6' }} />
                <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                  Resting HR
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-medium" style={{ color: colors.text }}>
                  {insights.currentMetrics.restingHR}
                </span>
                <span className="text-sm" style={{ color: colors.textSecondary }}>BPM</span>
              </div>
            </GlassPanel>

            {/* Sleep Hours */}
            {insights.sleepBreakdown && (
              <GlassPanel className="!p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Moon className="w-4 h-4" style={{ color: '#60a5fa' }} />
                  <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Sleep
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-medium" style={{ color: colors.text }}>
                    {insights.sleepBreakdown.totalHours}
                  </span>
                  <span className="text-sm" style={{ color: colors.textSecondary }}>hours</span>
                </div>
                {insights.sleepBreakdown.wakeTime && (
                  <div className="flex items-center gap-1 mt-2">
                    <Clock className="w-3 h-3" style={{ color: colors.textSecondary }} />
                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                      Woke {insights.sleepBreakdown.wakeTime}
                    </span>
                  </div>
                )}
              </GlassPanel>
            )}

            {/* Sleep Efficiency */}
            {insights.sleepBreakdown && (
              <GlassPanel className="!p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4" style={{ color: '#4ade80' }} />
                  <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Efficiency
                  </span>
                </div>
                <div className="text-2xl font-medium" style={{ color: colors.text }}>
                  {Math.round(insights.sleepBreakdown.efficiency)}%
                </div>
              </GlassPanel>
            )}
          </div>

          {/* New Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {/* Blood Oxygen (SpO2) */}
            {insights.currentMetrics.spo2 && (
              <GlassPanel className="!p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="w-4 h-4" style={{ color: '#60a5fa' }} />
                  <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Blood O₂
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-medium" style={{ color: colors.text }}>
                    {insights.currentMetrics.spo2}
                  </span>
                  <span className="text-sm" style={{ color: colors.textSecondary }}>%</span>
                </div>
                <span className="text-xs" style={{
                  color: insights.currentMetrics.spo2 >= 95 ? '#4ade80' :
                         insights.currentMetrics.spo2 >= 90 ? '#fbbf24' : '#f87171'
                }}>
                  {insights.currentMetrics.spo2 >= 95 ? 'Normal' :
                   insights.currentMetrics.spo2 >= 90 ? 'Borderline' : 'Low'}
                </span>
              </GlassPanel>
            )}

            {/* Skin Temperature */}
            {insights.currentMetrics.skinTemp && (
              <GlassPanel className="!p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Thermometer className="w-4 h-4" style={{ color: '#fb923c' }} />
                  <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Skin Temp
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-medium" style={{ color: colors.text }}>
                    {insights.currentMetrics.skinTemp.toFixed(1)}
                  </span>
                  <span className="text-sm" style={{ color: colors.textSecondary }}>°C</span>
                </div>
              </GlassPanel>
            )}

            {/* Respiratory Rate */}
            {insights.currentMetrics.respiratoryRate && (
              <GlassPanel className="!p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wind className="w-4 h-4" style={{ color: '#2dd4bf' }} />
                  <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Breathing
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-medium" style={{ color: colors.text }}>
                    {insights.currentMetrics.respiratoryRate}
                  </span>
                  <span className="text-sm" style={{ color: colors.textSecondary }}>/min</span>
                </div>
              </GlassPanel>
            )}

            {/* Stress Level (Calculated) */}
            {insights.currentMetrics.stressLevel && (
              <GlassPanel className="!p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4" style={{ color: '#c084fc' }} />
                  <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Stress
                  </span>
                </div>
                <div className="text-xl font-medium" style={{
                  color: insights.currentMetrics.stressLevel === 'Low' ? '#4ade80' :
                         insights.currentMetrics.stressLevel === 'Moderate' ? '#fbbf24' :
                         insights.currentMetrics.stressLevel === 'High' ? '#fb923c' : '#f87171'
                }}>
                  {insights.currentMetrics.stressLevel}
                </div>
                <span className="text-xs" style={{ color: colors.textSecondary }}>
                  Based on HRV & recovery
                </span>
              </GlassPanel>
            )}
          </div>
        </div>
      )}

      {/* 7-Day Recovery Chart */}
      {insights?.history7Day && insights.history7Day.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3 className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
              style={{ color: colors.textSecondary }}>
            <TrendingUp className="w-4 h-4" />
            Recovery Score (Last 7 Days)
          </h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.history7Day} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <XAxis
                  dataKey="dayName"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: colors.textSecondary, fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: colors.textSecondary, fontSize: 10 }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#1c1917' : '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: colors.text }}
                  itemStyle={{ color: colors.text }}
                  formatter={(value: number) => [`${value}%`, 'Recovery']}
                />
                <Bar dataKey="recovery" radius={[4, 4, 0, 0]}>
                  {insights.history7Day.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.recovery >= 67 ? '#4ade80' : entry.recovery >= 34 ? '#fbbf24' : '#f87171'}
                      opacity={index === insights.history7Day!.length - 1 ? 1 : 0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      )}

      {/* Sleep Phase Breakdown */}
      {insights?.sleepBreakdown && (
        <GlassPanel className="!p-4 mb-6">
          <h3 className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
              style={{ color: colors.textSecondary }}>
            <Moon className="w-4 h-4" />
            Last Night's Sleep ({insights.sleepBreakdown.totalHours}h total)
          </h3>
          <div className="space-y-3">
            {/* Deep Sleep */}
            <div className="flex items-center gap-3">
              <span className="text-xs w-16" style={{ color: colors.textSecondary }}>Deep</span>
              <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)' }}>
                <div
                  className="h-full rounded-lg transition-all"
                  style={{
                    width: `${(insights.sleepBreakdown.deepSleep / insights.sleepBreakdown.totalHours) * 100}%`,
                    backgroundColor: '#8b5cf6'
                  }}
                />
              </div>
              <span className="text-sm font-medium w-20 text-right" style={{ color: colors.text }}>
                {insights.sleepBreakdown.deepSleep}h ({Math.round((insights.sleepBreakdown.deepSleep / insights.sleepBreakdown.totalHours) * 100)}%)
              </span>
            </div>
            {/* REM Sleep */}
            <div className="flex items-center gap-3">
              <span className="text-xs w-16" style={{ color: colors.textSecondary }}>REM</span>
              <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)' }}>
                <div
                  className="h-full rounded-lg transition-all"
                  style={{
                    width: `${(insights.sleepBreakdown.remSleep / insights.sleepBreakdown.totalHours) * 100}%`,
                    backgroundColor: '#60a5fa'
                  }}
                />
              </div>
              <span className="text-sm font-medium w-20 text-right" style={{ color: colors.text }}>
                {insights.sleepBreakdown.remSleep}h ({Math.round((insights.sleepBreakdown.remSleep / insights.sleepBreakdown.totalHours) * 100)}%)
              </span>
            </div>
            {/* Light Sleep */}
            <div className="flex items-center gap-3">
              <span className="text-xs w-16" style={{ color: colors.textSecondary }}>Light</span>
              <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)' }}>
                <div
                  className="h-full rounded-lg transition-all"
                  style={{
                    width: `${(insights.sleepBreakdown.lightSleep / insights.sleepBreakdown.totalHours) * 100}%`,
                    backgroundColor: '#a78bfa'
                  }}
                />
              </div>
              <span className="text-sm font-medium w-20 text-right" style={{ color: colors.text }}>
                {insights.sleepBreakdown.lightSleep}h ({Math.round((insights.sleepBreakdown.lightSleep / insights.sleepBreakdown.totalHours) * 100)}%)
              </span>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* HRV 7-Day Trend */}
      {insights?.history7Day && insights.history7Day.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3 className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
              style={{ color: colors.textSecondary }}>
            <Activity className="w-4 h-4" />
            HRV Trend (7 Days)
          </h3>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insights.history7Day} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="hrvGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="dayName"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: colors.textSecondary, fontSize: 10 }}
                />
                <YAxis hide domain={['auto', 'auto']} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#1c1917' : '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: colors.text }}
                  itemStyle={{ color: colors.text }}
                  formatter={(value: number) => [`${value}ms`, 'HRV']}
                />
                <Area
                  type="monotone"
                  dataKey="hrv"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  fill="url(#hrvGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      )}

      {/* Recent Trends - Visual highlight */}
      {insights?.recentTrends && insights.recentTrends.length > 0 && (
        <div className="mb-6">
          <DataHighlight
            label="What Your Body Shows"
            items={insights.recentTrends}
            icon={<Activity className="w-4 h-4" />}
            accentColor={colors.whoopTeal}
          />
        </div>
      )}

      {/* Primary Reflection */}
      {insights?.reflection && (
        <div className="mb-8">
          <TwinReflection
            reflection={insights.reflection.text}
            timestamp={insights.reflection.generatedAt}
            confidence={insights.reflection.confidence}
            isNew={true}
          />
          {/* Evidence Section - Collapsible */}
          {insights?.evidence && insights.evidence.length > 0 && (
            <EvidenceSection
              evidence={insights.evidence}
              crossPlatformContext={insights.crossPlatformContext}
              className="mt-4"
            />
          )}
        </div>
      )}

      {/* Pattern Observations */}
      {insights?.patterns && insights.patterns.length > 0 && (
        <div className="mb-8">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Sparkles className="w-4 h-4" />
            Patterns I've Noticed
          </h3>
          <div className="space-y-3">
            {insights.patterns.map(pattern => (
              <PatternObservation
                key={pattern.id}
                text={pattern.text}
                occurrences={pattern.occurrences}
              />
            ))}
          </div>
        </div>
      )}

      {/* Historical Reflections */}
      {insights?.history && insights.history.length > 0 && (
        <div>
          <h3
            className="text-sm uppercase tracking-wider mb-4"
            style={{ color: colors.textSecondary }}
          >
            Past Observations
          </h3>
          <div className="space-y-3">
            {insights.history.map(past => (
              <GlassPanel key={past.id} variant="default" className="!p-4">
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
                >
                  {past.text}
                </p>
                <p
                  className="text-xs mt-2"
                  style={{ color: colors.textSecondary }}
                >
                  {new Date(past.generatedAt).toLocaleDateString()}
                </p>
              </GlassPanel>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!insights?.reflection && (
        <GlassPanel className="text-center py-12">
          <Activity className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
          <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
            Your twin is learning your rhythms
          </h3>
          <p className="mt-2" style={{ color: colors.textSecondary }}>
            As your Whoop tracks your recovery and strain, your twin will share what it notices.
          </p>
        </GlassPanel>
      )}
    </PageLayout>
  );
};

export default WhoopInsightsPage;
