import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Link2,
  MessageCircle,
  TrendingUp,
  Database,
  Brain,
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { dashboardAPI, ActivityItem as APIActivityItem, handleAPIError } from '@/services/apiService';

interface DashboardStats {
  connectedPlatforms: number;
  totalDataPoints: number;
  soulSignatureProgress: number;
  lastSync: string | null;
  trainingStatus: 'idle' | 'training' | 'ready';
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    connectedPlatforms: 0,
    totalDataPoints: 0,
    soulSignatureProgress: 0,
    lastSync: null,
    trainingStatus: 'idle'
  });
  const [activity, setActivity] = useState<APIActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const userId = user?.id;

      // Fetch real stats from API
      const [statsData, activityData] = await Promise.all([
        dashboardAPI.getStats(userId),
        dashboardAPI.getActivity(userId, 10)
      ]);

      setStats(statsData);
      setActivity(activityData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setError(handleAPIError(error));
    } finally {
      setLoading(false);
    }
  };

  // Helper functions for activity display
  const getActivityIcon = (iconName?: string) => {
    switch (iconName) {
      case 'CheckCircle2':
        return CheckCircle2;
      case 'Activity':
        return Activity;
      case 'Brain':
        return Brain;
      case 'RefreshCw':
        return RefreshCw;
      case 'Sparkles':
        return Sparkles;
      default:
        return CheckCircle2;
    }
  };

  const getActivityIconColor = (type: string) => {
    switch (type) {
      case 'connection':
        return 'text-green-500';
      case 'analysis':
        return 'text-blue-500';
      case 'twin_created':
        return 'text-green-500';
      case 'training':
        return 'text-orange-500';
      case 'sync':
        return 'text-purple-500';
      default:
        return 'text-gray-500';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  };

  const quickActions = [
    {
      id: 'connect',
      label: 'Connect Data Sources',
      description: 'Link your platforms to build your soul signature',
      icon: Link2,
      color: 'bg-blue-500/10 text-blue-500',
      path: '/get-started'
    },
    {
      id: 'soul',
      label: 'View Soul Signature',
      description: 'Explore your discovered personality insights',
      icon: Sparkles,
      color: 'bg-purple-500/10 text-purple-500',
      path: '/soul-signature'
    },
    {
      id: 'chat',
      label: 'Chat with Your Twin',
      description: 'Interact with your digital twin',
      icon: MessageCircle,
      color: 'bg-green-500/10 text-green-500',
      path: '/talk-to-twin'
    },
    {
      id: 'training',
      label: 'Model Training',
      description: 'Fine-tune your twin\'s personality',
      icon: Brain,
      color: 'bg-orange-500/10 text-orange-500',
      path: '/training'
    }
  ];

  const statusCards = [
    {
      id: 'platforms',
      label: 'Connected Platforms',
      value: stats.connectedPlatforms,
      icon: Link2,
      color: 'text-blue-500',
      change: '+2 this week'
    },
    {
      id: 'datapoints',
      label: 'Data Points Collected',
      value: stats.totalDataPoints.toLocaleString(),
      icon: Database,
      color: 'text-purple-500',
      change: '+247 today'
    },
    {
      id: 'progress',
      label: 'Soul Signature Progress',
      value: `${stats.soulSignatureProgress}%`,
      icon: TrendingUp,
      color: 'text-green-500',
      change: '+12% this week'
    },
    {
      id: 'training',
      label: 'Training Status',
      value: stats.trainingStatus === 'ready' ? 'Ready' : stats.trainingStatus === 'training' ? 'Training' : 'Idle',
      icon: Brain,
      color: stats.trainingStatus === 'ready' ? 'text-green-500' : 'text-orange-500',
      change: stats.trainingStatus === 'ready' ? 'Model ready' : 'Needs data'
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[hsl(var(--claude-bg))]">
        <div className="text-center">
          <Activity className="w-8 h-8 text-[hsl(var(--claude-accent))] animate-spin mx-auto mb-4" />
          <p className="text-[hsl(var(--claude-text-muted))]">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))] p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[hsl(var(--claude-text))] mb-2">
          Welcome back, {user?.firstName || 'there'}
        </h1>
        <p className="text-[hsl(var(--claude-text-muted))]">
          Here's an overview of your digital twin's progress
        </p>
      </div>

      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statusCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-6 hover:border-[hsl(var(--claude-accent))] transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-4">
                <Icon className={`w-5 h-5 ${card.color}`} />
                <span className="text-xs text-[hsl(var(--claude-text-muted))]">
                  {card.change}
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[hsl(var(--claude-text))] mb-1">
                  {card.value}
                </p>
                <p className="text-sm text-[hsl(var(--claude-text-muted))]">
                  {card.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-[hsl(var(--claude-text))] mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => navigate(action.path)}
                className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-6 text-left hover:border-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-surface-raised))] transition-all duration-200 group"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg ${action.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))] mb-1">
                      {action.label}
                    </h3>
                    <p className="text-sm text-[hsl(var(--claude-text-muted))]">
                      {action.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[hsl(var(--claude-text))]">
            Recent Activity
          </h2>
          <button
            onClick={loadDashboardData}
            className="text-sm text-[hsl(var(--claude-text-muted))] hover:text-[hsl(var(--claude-accent))] transition-colors"
            title="Refresh activity"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">
          {activity.length > 0 ? (
            activity.map((item) => {
              const IconComponent = getActivityIcon(item.icon);
              const iconColor = getActivityIconColor(item.type);

              return (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]">
                  <IconComponent className={`w-5 h-5 ${iconColor} mt-0.5`} />
                  <div className="flex-1">
                    <p className="text-sm text-[hsl(var(--claude-text))]">
                      {item.message}
                    </p>
                    <p className="text-xs text-[hsl(var(--claude-text-muted))] mt-1">
                      {formatTimeAgo(item.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-6 text-[hsl(var(--claude-text-muted))]">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent activity</p>
            </div>
          )}
        </div>
      </div>

      {/* Last Sync Info */}
      {stats.lastSync && (
        <div className="mt-6 flex items-center gap-2 text-sm text-[hsl(var(--claude-text-muted))]">
          <Clock className="w-4 h-4" />
          <span>
            Last synced {new Date(stats.lastSync).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
