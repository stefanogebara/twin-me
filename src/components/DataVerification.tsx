import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Mail, Calendar, Loader2, RefreshCw, AlertTriangle, Music, Youtube, MessageCircle, Github, Briefcase, Hash, Clock } from 'lucide-react';

interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  description: string;
}

interface PlatformStatus {
  connected: boolean;
  isActive: boolean;
  tokenExpired: boolean;
  lastSync?: string;
  status?: string;
  error?: string;
}

interface VerificationData {
  gmail?: {
    provider: string;
    messageCount: number;
    totalEmails?: number;
    unreadCount?: number;
    lastSync?: string;
    messages: EmailMessage[];
    accessVerified: boolean;
    error?: string;
  };
  calendar?: {
    provider: string;
    calendarName?: string;
    eventCount: number;
    totalEvents?: number;
    lastSync?: string;
    events: CalendarEvent[];
    accessVerified: boolean;
    error?: string;
  };
  platforms?: Record<string, PlatformStatus>;
}

interface DataVerificationProps {
  userId: string;
  connectedServices: string[];
}

const platformConfig = {
  spotify: {
    name: 'Spotify',
    icon: Music,
    color: '#1DB954'
  },
  youtube: {
    name: 'YouTube',
    icon: Youtube,
    color: '#FF0000'
  },
  discord: {
    name: 'Discord',
    icon: MessageCircle,
    color: '#5865F2'
  },
  github: {
    name: 'GitHub',
    icon: Github,
    color: '#333333'
  },
  linkedin: {
    name: 'LinkedIn',
    icon: Briefcase,
    color: '#0077B5'
  },
  slack: {
    name: 'Slack',
    icon: Hash,
    color: '#4A154B'
  },
  google_gmail: {
    name: 'Gmail',
    icon: Mail,
    color: '#EA4335'
  },
  google_calendar: {
    name: 'Google Calendar',
    icon: Calendar,
    color: '#4285F4'
  }
};

export const DataVerification: React.FC<DataVerificationProps> = ({ userId, connectedServices }) => {
  const [verificationData, setVerificationData] = useState<VerificationData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platformStatuses, setPlatformStatuses] = useState<Record<string, PlatformStatus>>({});

  const fetchPlatformStatuses = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/connectors/status/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          }
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setPlatformStatuses(result.data);
        }
      }
    } catch (err) {
      console.error('Error fetching platform statuses:', err);
    }
  };

  const fetchVerificationData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch platform statuses first
      await fetchPlatformStatuses();

      // Then fetch Gmail/Calendar verification if needed
      if (connectedServices.includes('google_gmail') || connectedServices.includes('google_calendar')) {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/data-verification/all/${userId}`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Verification failed: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
          setVerificationData(result.data);
        } else {
          setError(result.error || 'Failed to verify data access');
        }
      }
    } catch (err) {
      console.error('Error fetching verification data:', err);
      setError('Failed to verify data access. Please try reconnecting.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerificationData();
  }, [connectedServices]);

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (platform: string) => {
    const status = platformStatuses[platform];
    if (!status) return null;

    if (!status.connected && !status.tokenExpired) {
      return null; // Not connected, don't show
    }

    if (status.tokenExpired || status.status === 'token_expired' || status.status === 'encryption_key_mismatch') {
      return (
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5" style={{ color: '#EF4444' }} />
          <span style={{ color: '#EF4444' }}>Token Expired</span>
        </div>
      );
    }

    if (status.connected && status.isActive) {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5" style={{ color: '#10B981' }} />
          <span style={{ color: '#10B981' }}>Connected</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <XCircle className="w-5 h-5" style={{ color: '#EF4444' }} />
        <span style={{ color: '#EF4444' }}>Not Connected</span>
      </div>
    );
  };

  const handleReconnect = (platform: string) => {
    // Initiate OAuth flow for the platform
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    window.location.href = `${baseUrl}/connectors/connect/${platform}`;
  };

  const renderPlatformCard = (platform: string) => {
    const config = platformConfig[platform];
    if (!config) return null;

    const status = platformStatuses[platform];
    if (!status || (!status.connected && !status.tokenExpired)) return null;

    const Icon = config.icon;
    const needsReconnection = status.tokenExpired || status.status === 'token_expired' || status.status === 'encryption_key_mismatch';

    return (
      <div
        key={platform}
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: 'var(--_color-theme---surface)',
          borderColor: 'var(--_color-theme---border)'
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5" style={{ color: config.color }} />
            <h4
              className="font-medium"
              style={{
                color: 'var(--_color-theme---text)',
                fontFamily: 'var(--_typography---font--styrene-a)'
              }}
            >
              {config.name} Access
            </h4>
          </div>
          {getStatusBadge(platform)}
        </div>

        <p style={{ color: 'var(--_color-theme---text-secondary)' }}>
          {needsReconnection
            ? `${config.name} access token expired. Please reconnect.`
            : `${config.name} is connected and active.`
          }
        </p>

        {status.lastSync && (
          <p className="text-xs mt-2" style={{ color: 'var(--_color-theme---text-secondary)' }}>
            Last synced: {formatDate(status.lastSync)}
          </p>
        )}

        {/* Add Reconnect button for expired/invalid tokens */}
        {needsReconnection && (
          <button
            onClick={() => handleReconnect(platform)}
            className="mt-4 px-4 py-2 rounded-lg flex items-center gap-2 transition-all hover:opacity-80"
            style={{
              backgroundColor: 'var(--_color-theme---accent)',
              color: 'var(--_color-theme---accent-text)'
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Reconnect {config.name}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h3
          className="text-lg font-semibold"
          style={{
            color: 'var(--_color-theme---text)',
            fontFamily: 'var(--_typography---font--styrene-a)'
          }}
        >
          Data Access Verification
        </h3>
        <button
          onClick={fetchVerificationData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          style={{
            backgroundColor: 'var(--_color-theme---surface-raised)',
            color: 'var(--_color-theme---text)',
            opacity: loading ? 0.5 : 1
          }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--_color-theme---accent)' }} />
        </div>
      )}

      {error && (
        <div
          className="p-4 rounded-lg border flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)'
          }}
        >
          <AlertTriangle className="w-5 h-5" style={{ color: '#EF4444' }} />
          <span style={{ color: 'var(--_color-theme---text)' }}>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {/* Display all platforms with their status */}
          {Object.keys(platformConfig).map(platform => renderPlatformCard(platform))}

          {/* Gmail Verification Details (if available) */}
          {connectedServices.includes('google_gmail') && verificationData.gmail && verificationData.gmail.messages && (
            <div
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: 'var(--_color-theme---surface)',
                borderColor: 'var(--_color-theme---border)'
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <Mail className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
                <h4
                  className="font-medium"
                  style={{
                    color: 'var(--_color-theme---text)',
                    fontFamily: 'var(--_typography---font--styrene-a)'
                  }}
                >
                  Gmail Details
                </h4>
              </div>

              {verificationData.gmail.messages.length > 0 && (
                <div className="space-y-3">
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--_color-theme---text-secondary)' }}
                  >
                    Recent Messages ({verificationData.gmail.messageCount}):
                  </p>
                  {verificationData.gmail.messages.slice(0, 3).map((message) => (
                    <div
                      key={message.id}
                      className="p-3 rounded border"
                      style={{
                        backgroundColor: 'var(--_color-theme---surface-raised)',
                        borderColor: 'var(--_color-theme---border)'
                      }}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <p
                          className="font-medium text-sm"
                          style={{ color: 'var(--_color-theme---text)' }}
                        >
                          {message.subject}
                        </p>
                        <span
                          className="text-xs"
                          style={{ color: 'var(--_color-theme---text-secondary)' }}
                        >
                          {formatDate(message.date)}
                        </span>
                      </div>
                      <p
                        className="text-xs mb-1"
                        style={{ color: 'var(--_color-theme---text-secondary)' }}
                      >
                        From: {message.from}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Calendar Verification Details (if available) */}
          {connectedServices.includes('google_calendar') && verificationData.calendar && verificationData.calendar.events && (
            <div
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: 'var(--_color-theme---surface)',
                borderColor: 'var(--_color-theme---border)'
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
                <h4
                  className="font-medium"
                  style={{
                    color: 'var(--_color-theme---text)',
                    fontFamily: 'var(--_typography---font--styrene-a)'
                  }}
                >
                  Calendar Details
                </h4>
              </div>

              {verificationData.calendar.events.length > 0 && (
                <div className="space-y-3">
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--_color-theme---text-secondary)' }}
                  >
                    Upcoming Events ({verificationData.calendar.eventCount}):
                  </p>
                  {verificationData.calendar.events.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="p-3 rounded border"
                      style={{
                        backgroundColor: 'var(--_color-theme---surface-raised)',
                        borderColor: 'var(--_color-theme---border)'
                      }}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <p
                          className="font-medium text-sm"
                          style={{ color: 'var(--_color-theme---text)' }}
                        >
                          {event.summary}
                        </p>
                        <span
                          className="text-xs"
                          style={{ color: 'var(--_color-theme---text-secondary)' }}
                        >
                          {formatDate(event.start)}
                        </span>
                      </div>
                      {event.location !== 'No location' && (
                        <p
                          className="text-xs mb-1"
                          style={{ color: 'var(--_color-theme---text-secondary)' }}
                        >
                          Location: {event.location}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary Status */}
      {!loading && Object.keys(platformStatuses).length > 0 && (
        <div
          className="p-4 rounded-lg border flex items-center gap-3"
          style={{
            backgroundColor: 'var(--_color-theme---surface-raised)',
            borderColor: 'var(--_color-theme---border)'
          }}
        >
          <CheckCircle className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
          <span style={{ color: 'var(--_color-theme---text)' }}>
            Perfect! {Object.keys(platformStatuses).filter(p => platformStatuses[p].connected).length} platforms connected
          </span>
        </div>
      )}
    </div>
  );
};