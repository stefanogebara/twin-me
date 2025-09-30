import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Mail, Calendar, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

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
}

interface DataVerificationProps {
  userId: string;
  connectedServices: string[];
}

export const DataVerification: React.FC<DataVerificationProps> = ({ userId, connectedServices }) => {
  const [verificationData, setVerificationData] = useState<VerificationData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVerificationData = async () => {
    setLoading(true);
    setError(null);

    try {
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
    } catch (err) {
      console.error('Error fetching verification data:', err);
      setError('Failed to verify data access. Please try reconnecting.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connectedServices.includes('google_gmail') || connectedServices.includes('google_calendar')) {
      fetchVerificationData();
    }
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

  if (!connectedServices.includes('google_gmail') && !connectedServices.includes('google_calendar')) {
    return null;
  }

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
          {/* Gmail Verification */}
          {connectedServices.includes('google_gmail') && verificationData.gmail && (
            <div
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: 'var(--_color-theme---surface)',
                borderColor: 'var(--_color-theme---border)'
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
                  <h4
                    className="font-medium"
                    style={{
                      color: 'var(--_color-theme---text)',
                      fontFamily: 'var(--_typography---font--styrene-a)'
                    }}
                  >
                    Gmail Access
                  </h4>
                </div>
                {verificationData.gmail.accessVerified ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" style={{ color: '#10B981' }} />
                    <span style={{ color: '#10B981' }}>Verified</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5" style={{ color: '#EF4444' }} />
                    <span style={{ color: '#EF4444' }}>Not Verified</span>
                  </div>
                )}
              </div>

              {verificationData.gmail.error ? (
                <p style={{ color: 'var(--_color-theme---text-secondary)' }}>
                  {verificationData.gmail.error}
                </p>
              ) : (
                <>
                  <div className="mb-4 space-y-2">
                    <p style={{ color: 'var(--_color-theme---text-secondary)' }}>
                      Found {verificationData.gmail.messageCount} recent messages
                    </p>
                    {verificationData.gmail.totalEmails !== undefined && (
                      <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                        <span>📊 Total emails: {verificationData.gmail.totalEmails}</span>
                        {verificationData.gmail.unreadCount !== undefined && (
                          <span>📬 Unread: {verificationData.gmail.unreadCount}</span>
                        )}
                      </div>
                    )}
                    {verificationData.gmail.lastSync && (
                      <p className="text-xs" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                        Last synced: {formatDate(verificationData.gmail.lastSync)}
                      </p>
                    )}
                  </div>

                  {verificationData.gmail.messages.length > 0 && (
                    <div className="space-y-3">
                      <p
                        className="text-sm font-medium"
                        style={{ color: 'var(--_color-theme---text-secondary)' }}
                      >
                        Recent Messages:
                      </p>
                      {verificationData.gmail.messages.map((message) => (
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
                          <p
                            className="text-xs"
                            style={{ color: 'var(--_color-theme---text-secondary)' }}
                          >
                            {message.snippet}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Calendar Verification */}
          {connectedServices.includes('google_calendar') && verificationData.calendar && (
            <div
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: 'var(--_color-theme---surface)',
                borderColor: 'var(--_color-theme---border)'
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
                  <h4
                    className="font-medium"
                    style={{
                      color: 'var(--_color-theme---text)',
                      fontFamily: 'var(--_typography---font--styrene-a)'
                    }}
                  >
                    Google Calendar Access
                  </h4>
                </div>
                {verificationData.calendar.accessVerified ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" style={{ color: '#10B981' }} />
                    <span style={{ color: '#10B981' }}>Verified</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5" style={{ color: '#EF4444' }} />
                    <span style={{ color: '#EF4444' }}>Not Verified</span>
                  </div>
                )}
              </div>

              {verificationData.calendar.error ? (
                <p style={{ color: 'var(--_color-theme---text-secondary)' }}>
                  {verificationData.calendar.error}
                </p>
              ) : (
                <>
                  <div className="mb-4 space-y-2">
                    <p style={{ color: 'var(--_color-theme---text-secondary)' }}>
                      {verificationData.calendar.calendarName && `Calendar: ${verificationData.calendar.calendarName} - `}
                      Found {verificationData.calendar.eventCount} upcoming events
                    </p>
                    {verificationData.calendar.totalEvents !== undefined && (
                      <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                        <span>📅 Total events tracked: {verificationData.calendar.totalEvents}</span>
                      </div>
                    )}
                    {verificationData.calendar.lastSync && (
                      <p className="text-xs" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                        Last synced: {formatDate(verificationData.calendar.lastSync)}
                      </p>
                    )}
                  </div>

                  {verificationData.calendar.events.length > 0 && (
                    <div className="space-y-3">
                      <p
                        className="text-sm font-medium"
                        style={{ color: 'var(--_color-theme---text-secondary)' }}
                      >
                        Upcoming Events:
                      </p>
                      {verificationData.calendar.events.map((event) => (
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
                          {event.description !== 'No description' && (
                            <p
                              className="text-xs"
                              style={{ color: 'var(--_color-theme---text-secondary)' }}
                            >
                              {event.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};