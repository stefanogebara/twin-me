/**
 * ProactiveNotifications Component
 *
 * Displays proactive insights and notifications from Moltbot's trigger system.
 * Shows real-time alerts, suggestions, and inferences based on user behavioral patterns.
 */

import React, { useState, useEffect } from 'react';
import { Bell, Brain, Music, Heart, Calendar, Lightbulb, X, ChevronRight } from 'lucide-react';

interface Notification {
  id: string;
  type: 'notification' | 'suggestion' | 'inference' | 'mood';
  message?: string;
  triggeredBy?: string;
  timestamp: string;
  read: boolean;
}

interface Insight {
  type: 'suggestion' | 'inference' | 'mood';
  message?: string;
  category?: string;
  inference?: string;
  mood?: string;
  source?: string;
  confidence?: number;
  timestamp: string;
}

interface ProactiveNotificationsProps {
  userId?: string;
  compact?: boolean;
  maxItems?: number;
  onNotificationClick?: (notification: Notification) => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const ProactiveNotifications: React.FC<ProactiveNotificationsProps> = ({
  userId,
  compact = false,
  maxItems = 5,
  onNotificationClick
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchData();
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setLoading(false);
        return;
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Fetch notifications and insights in parallel
      const [notifResponse, insightsResponse] = await Promise.all([
        fetch(`${API_BASE}/api/moltbot/notifications?limit=${maxItems * 2}`, { headers }),
        fetch(`${API_BASE}/api/moltbot/insights`, { headers })
      ]);

      if (notifResponse.ok) {
        const notifData = await notifResponse.json();
        setNotifications(notifData.notifications || []);
      }

      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        setInsights(insightsData.insights || []);
      }

      setError(null);
    } catch (err) {
      console.error('[ProactiveNotifications] Error fetching data:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: string, category?: string) => {
    if (category === 'music' || type === 'mood') return <Music className="w-4 h-4" />;
    if (category === 'health') return <Heart className="w-4 h-4" />;
    if (category === 'schedule') return <Calendar className="w-4 h-4" />;
    if (type === 'inference') return <Brain className="w-4 h-4" />;
    if (type === 'suggestion') return <Lightbulb className="w-4 h-4" />;
    return <Bell className="w-4 h-4" />;
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'suggestion': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'inference': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'mood': return 'bg-green-500/10 text-green-400 border-green-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const dismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const displayItems = showAll
    ? [...notifications, ...insights.map((i, idx) => ({ ...i, id: `insight-${idx}` }))]
    : [...notifications.slice(0, maxItems), ...insights.slice(0, Math.max(0, maxItems - notifications.length))];

  if (compact) {
    return (
      <div className="relative">
        <button
          className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors relative"
          onClick={() => setShowAll(!showAll)}
        >
          <Bell className="w-5 h-5 text-gray-400" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full text-[10px] flex items-center justify-center text-white font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {showAll && (
          <div className="absolute right-0 top-12 w-80 bg-gray-900 rounded-xl border border-gray-700 shadow-2xl z-50 overflow-hidden">
            <div className="p-3 border-b border-gray-700 flex items-center justify-between">
              <span className="text-sm font-medium text-white">Notifications</span>
              <button onClick={() => setShowAll(false)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {displayItems.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No notifications yet
                </div>
              ) : (
                displayItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-3 border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => 'message' in item && onNotificationClick?.(item as Notification)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-lg ${getTypeColor(item.type)}`}>
                        {getIcon(item.type, 'category' in item ? item.category : undefined)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 line-clamp-2">
                          {'message' in item ? item.message : ('inference' in item ? item.inference : `Mood: ${item.mood}`)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatTimestamp(item.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Bell className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Proactive Insights</h3>
              <p className="text-xs text-gray-500">Real-time observations from your digital twin</p>
            </div>
          </div>
          {unreadCount > 0 && (
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-medium">
              {unreadCount} new
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-pulse flex flex-col items-center gap-2">
              <div className="w-8 h-8 bg-gray-700 rounded-full" />
              <div className="w-32 h-4 bg-gray-700 rounded" />
            </div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-gray-500">
            <p>{error}</p>
            <button onClick={fetchData} className="mt-2 text-blue-400 text-sm hover:underline">
              Retry
            </button>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="p-6 text-center">
            <Brain className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No insights yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Your digital twin is learning your patterns
            </p>
          </div>
        ) : (
          displayItems.map((item, idx) => (
            <div
              key={item.id || idx}
              className="p-4 hover:bg-gray-800/30 cursor-pointer transition-colors group"
              onClick={() => 'message' in item && onNotificationClick?.(item as Notification)}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${getTypeColor(item.type)}`}>
                  {getIcon(item.type, 'category' in item ? item.category : undefined)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                      {item.type}
                    </span>
                    {'confidence' in item && item.confidence && (
                      <span className="text-xs text-gray-500">
                        {Math.round(item.confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-200">
                    {'message' in item ? item.message : ('inference' in item ? item.inference : `Current mood: ${item.mood}`)}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(item.timestamp)}
                    </span>
                    {'triggeredBy' in item && item.triggeredBy && (
                      <span className="text-xs text-gray-600">
                        via {item.triggeredBy}
                      </span>
                    )}
                  </div>
                </div>
                {'id' in item && (
                  <button
                    onClick={(e) => dismissNotification(item.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-gray-300 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {(notifications.length > maxItems || insights.length > 0) && (
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full flex items-center justify-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {showAll ? 'Show less' : 'View all insights'}
            <ChevronRight className={`w-4 h-4 transition-transform ${showAll ? 'rotate-90' : ''}`} />
          </button>
        </div>
      )}
    </div>
  );
};

export default ProactiveNotifications;
