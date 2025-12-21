import React, { useState, useEffect } from 'react';
import { Activity, Clock, TrendingUp, Eye } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const EXTENSION_ID = 'acnofcjjfjaikcfnalggkkbghjaijepc';

interface ExtensionStats {
  netflixItems: number;
  youtubeItems: number;
  redditItems: number;
  activitiesCollected: number;
  lastSync: string | null;
  observerModeEnabled: boolean;
}

export const ExtensionDataStats: React.FC = () => {
  const { theme } = useTheme();
  const [stats, setStats] = useState<ExtensionStats | null>(null);
  const [isExtensionInstalled, setIsExtensionInstalled] = useState(false);

  useEffect(() => {
    // Check if extension is installed and get stats
    checkExtensionAndGetStats();

    // Poll for updates every 30 seconds
    const interval = setInterval(checkExtensionAndGetStats, 30000);

    return () => clearInterval(interval);
  }, []);

  const checkExtensionAndGetStats = () => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      setIsExtensionInstalled(false);
      return;
    }

    try {
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        { type: 'GET_STATUS' },
        (response) => {
          if (chrome.runtime.lastError) {
            setIsExtensionInstalled(false);
          } else if (response) {
            setIsExtensionInstalled(true);
            setStats({
              netflixItems: response.netflixItems || 0,
              youtubeItems: response.youtubeItems || 0,
              redditItems: response.redditItems || 0,
              activitiesCollected: response.bufferSize || 0,
              lastSync: response.lastSync || null,
              observerModeEnabled: response.observerMode || false
            });
          }
        }
      );
    } catch (error) {
      setIsExtensionInstalled(false);
    }
  };

  if (!isExtensionInstalled) {
    return null; // Don't show anything if extension isn't installed
  }

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div
      className="rounded-2xl p-6 mb-6"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
        backdropFilter: 'blur(16px)',
        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: theme === 'dark' ? '#3C3C38' : '#F5F5F4',
            }}
          >
            <Activity
              className="w-5 h-5"
              style={{ color: '#D97706' }}
            />
          </div>
          <div>
            <h3
              className="text-lg font-medium"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
              }}
            >
              Soul Observer Active
            </h3>
            <p
              className="text-sm"
              style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
            >
              Real-time behavioral tracking enabled
            </p>
          </div>
        </div>
        {stats?.observerModeEnabled && (
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-full text-sm"
            style={{
              backgroundColor: theme === 'dark' ? '#065F46' : '#ECFDF5',
              color: theme === 'dark' ? '#34D399' : '#065F46',
            }}
          >
            <Eye className="w-4 h-4" />
            Collecting
          </div>
        )}
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Netflix Data Points */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp
                  className="w-4 h-4"
                  style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
                />
                <p
                  className="text-xs"
                  style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
                >
                  Netflix Items
                </p>
              </div>
              <p
                className="text-2xl font-semibold"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                }}
              >
                {stats.netflixItems}
              </p>
            </div>

            {/* YouTube Data Points */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp
                  className="w-4 h-4"
                  style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
                />
                <p
                  className="text-xs"
                  style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
                >
                  YouTube Items
                </p>
              </div>
              <p
                className="text-2xl font-semibold"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                }}
              >
                {stats.youtubeItems}
              </p>
            </div>

            {/* Reddit Data Points */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp
                  className="w-4 h-4"
                  style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
                />
                <p
                  className="text-xs"
                  style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
                >
                  Reddit Items
                </p>
              </div>
              <p
                className="text-2xl font-semibold"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                }}
              >
                {stats.redditItems}
              </p>
            </div>

            {/* Activities Collected */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Activity
                  className="w-4 h-4"
                  style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
                />
                <p
                  className="text-xs"
                  style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
                >
                  Browsing Activities
                </p>
              </div>
              <p
                className="text-2xl font-semibold"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                }}
              >
                {stats.activitiesCollected}
              </p>
            </div>
          </div>

          {/* Last Sync Banner */}
          <div
            className="flex items-center justify-between px-4 py-2 rounded-lg"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(217, 119, 6, 0.1)' : '#FEF3C7',
            }}
          >
            <div className="flex items-center gap-2">
              <Clock
                className="w-4 h-4"
                style={{ color: '#D97706' }}
              />
              <p
                className="text-sm font-medium"
                style={{ color: theme === 'dark' ? '#FCD34D' : '#78350F' }}
              >
                Last synced {formatLastSync(stats.lastSync)}
              </p>
            </div>
            <p
              className="text-xs"
              style={{ color: theme === 'dark' ? 'rgba(252, 211, 77, 0.6)' : '#A16207' }}
            >
              Total: {stats.netflixItems + stats.youtubeItems + stats.redditItems + stats.activitiesCollected} items
            </p>
          </div>
        </>
      )}

      <div
        className="mt-4 pt-4"
        style={{
          borderTop: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.06)',
        }}
      >
        <p
          className="text-xs"
          style={{ color: theme === 'dark' ? '#A8A29E' : '#78716c' }}
        >
          💡 The Soul Observer extension tracks your authentic browsing patterns to build a more accurate soul signature
        </p>
      </div>
    </div>
  );
};

export default ExtensionDataStats;
