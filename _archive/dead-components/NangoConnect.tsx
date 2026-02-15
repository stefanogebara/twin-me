/**
 * NANGO CONNECT COMPONENT
 *
 * Platform connection interface using Nango unified API
 * Displays available platforms and manages OAuth connections
 */

import React, { useState, useEffect, useCallback } from 'react';
import Nango from '@nangohq/frontend';
import { useAuth } from '@/contexts/AuthContext';

// Platform icons and metadata
const PLATFORM_META: Record<string, { icon: string; color: string; description: string }> = {
  spotify: {
    icon: '🎵',
    color: '#1DB954',
    description: 'Music taste, listening patterns, playlists'
  },
  'google-calendar': {
    icon: '📅',
    color: '#4285F4',
    description: 'Schedule patterns, work-life balance'
  },
  whoop: {
    icon: '💪',
    color: '#00A6A0',
    description: 'Recovery, sleep, strain, workouts'
  },
  discord: {
    icon: '🎮',
    color: '#5865F2',
    description: 'Communities, gaming, social connections'
  },
  github: {
    icon: '💻',
    color: '#333333',
    description: 'Coding style, projects, contributions'
  },
  linkedin: {
    icon: '💼',
    color: '#0077B5',
    description: 'Career, professional network'
  },
  youtube: {
    icon: '📺',
    color: '#FF0000',
    description: 'Content interests, learning topics'
  },
  reddit: {
    icon: '🗣️',
    color: '#FF4500',
    description: 'Interests, discussions, communities'
  },
  google: {
    icon: '📧',
    color: '#EA4335',
    description: 'Communication patterns'
  },
  twitch: {
    icon: '🎬',
    color: '#9146FF',
    description: 'Gaming, streaming preferences'
  },
  outlook: {
    icon: '📧',
    color: '#0078D4',
    description: 'Email patterns, calendar insights, communication style'
  },
  'microsoft-outlook': {
    icon: '📧',
    color: '#0078D4',
    description: 'Email patterns, calendar insights, communication style'
  }
};

interface Platform {
  id: string;
  name: string;
  category: string;
  soulDataPoints: string[];
}

interface Connection {
  connected: boolean;
  platform: string;
  connectionId?: string;
  createdAt?: string;
}

interface NangoConnectProps {
  onConnectionChange?: (platform: string, connected: boolean) => void;
  showExtractButton?: boolean;
}

export const NangoConnect: React.FC<NangoConnectProps> = ({
  onConnectionChange,
  showExtractButton = true
}) => {
  const { user, token } = useAuth();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [connections, setConnections] = useState<Record<string, Connection>>({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch platforms and connections
  const fetchData = useCallback(async () => {
    if (!token) return;

    try {
      const [platformsRes, connectionsRes] = await Promise.all([
        fetch('/api/nango/platforms'),
        fetch('/api/nango/connections', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const platformsData = await platformsRes.json();
      const connectionsData = await connectionsRes.json();

      if (platformsData.success) {
        setPlatforms(platformsData.platforms);
      }

      if (connectionsData.success) {
        setConnections(connectionsData.connections);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load platforms');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Connect to a platform
  const connectPlatform = async (platformId: string) => {
    if (!token || !user) return;

    setConnecting(platformId);
    setError(null);

    try {
      // Get connect session from backend
      const sessionRes = await fetch('/api/nango/connect-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ integrationId: platformId })
      });

      const sessionData = await sessionRes.json();

      if (!sessionData.success) {
        throw new Error(sessionData.error || 'Failed to create session');
      }

      // Open Nango Connect UI
      const nango = new Nango({ connectSessionToken: sessionData.sessionToken });

      await nango.openConnectUI({
        sessionToken: sessionData.sessionToken,
        onEvent: (event: any) => {
          console.log('Nango event:', event);

          if (event.type === 'connect' && event.payload?.connectionId) {
            // Connection successful
            setConnections(prev => ({
              ...prev,
              [platformId]: {
                connected: true,
                platform: platformId,
                connectionId: event.payload.connectionId
              }
            }));
            onConnectionChange?.(platformId, true);
          } else if (event.type === 'close') {
            // UI closed
            setConnecting(null);
          }
        }
      });
    } catch (err: any) {
      console.error('Connect error:', err);
      setError(err.message || 'Failed to connect');
    } finally {
      setConnecting(null);
    }
  };

  // Disconnect from a platform
  const disconnectPlatform = async (platformId: string) => {
    if (!token) return;

    try {
      const res = await fetch(`/api/nango/connections/${platformId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (data.success) {
        setConnections(prev => ({
          ...prev,
          [platformId]: { connected: false, platform: platformId }
        }));
        onConnectionChange?.(platformId, false);
      }
    } catch (err) {
      console.error('Disconnect error:', err);
      setError('Failed to disconnect');
    }
  };

  // Extract data from a platform
  const extractData = async (platformId: string) => {
    if (!token) return;

    setExtracting(platformId);

    try {
      const res = await fetch(`/api/nango/extract/${platformId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (data.success) {
        console.log(`Extracted data from ${platformId}:`, data.extractedData);
        // You could show a success toast here
      }
    } catch (err) {
      console.error('Extract error:', err);
    } finally {
      setExtracting(null);
    }
  };

  // Group platforms by category
  const groupedPlatforms = platforms.reduce((acc, platform) => {
    if (!acc[platform.category]) {
      acc[platform.category] = [];
    }
    acc[platform.category].push(platform);
    return acc;
  }, {} as Record<string, Platform[]>);

  const categoryLabels: Record<string, string> = {
    entertainment: 'Entertainment',
    productivity: 'Productivity',
    health: 'Health & Fitness',
    social: 'Social',
    professional: 'Professional',
    communication: 'Communication'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const connectedCount = Object.values(connections).filter(c => c.connected).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Connect Your Platforms</h2>
          <p className="text-sm text-muted-foreground">
            {connectedCount} of {platforms.length} platforms connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(connectedCount / platforms.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-md">
          {error}
        </div>
      )}

      {/* Platform Grid by Category */}
      {Object.entries(groupedPlatforms).map(([category, categoryPlatforms]) => (
        <div key={category} className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {categoryLabels[category] || category}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryPlatforms.map(platform => {
              const meta = PLATFORM_META[platform.id] || { icon: '🔗', color: '#666', description: '' };
              const connection = connections[platform.id];
              const isConnected = connection?.connected;
              const isConnecting = connecting === platform.id;
              const isExtracting = extracting === platform.id;

              return (
                <div
                  key={platform.id}
                  className={`
                    relative p-4 rounded-lg border transition-all
                    ${isConnected
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border hover:border-primary/30'
                    }
                  `}
                >
                  {/* Connected Badge */}
                  {isConnected && (
                    <div className="absolute top-2 right-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-500">
                        Connected
                      </span>
                    </div>
                  )}

                  {/* Platform Info */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                      style={{ backgroundColor: `${meta.color}20` }}
                    >
                      {meta.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium">{platform.name}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {meta.description}
                      </p>
                    </div>
                  </div>

                  {/* Soul Data Points */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {platform.soulDataPoints.slice(0, 3).map(point => (
                      <span
                        key={point}
                        className="inline-block px-2 py-0.5 text-xs rounded-full bg-muted"
                      >
                        {point.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex gap-2">
                    {isConnected ? (
                      <>
                        {showExtractButton && (
                          <button
                            onClick={() => extractData(platform.id)}
                            disabled={isExtracting}
                            className="flex-1 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {isExtracting ? 'Extracting...' : 'Extract Data'}
                          </button>
                        )}
                        <button
                          onClick={() => disconnectPlatform(platform.id)}
                          className="px-3 py-1.5 text-sm rounded-md border border-destructive text-destructive hover:bg-destructive/10"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => connectPlatform(platform.id)}
                        disabled={isConnecting}
                        className="flex-1 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {isConnecting ? 'Connecting...' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default NangoConnect;
