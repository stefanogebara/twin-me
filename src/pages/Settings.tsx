import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft,
  User,
  Shield,
  Bell,
  Palette,
  Link,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [connectorStatus, setConnectorStatus] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch connector status on load
  useEffect(() => {
    if (user?.id) {
      fetchConnectorStatus();
    }
  }, [user]);

  const fetchConnectorStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/connectors/status/${user?.id}`);
      if (response.ok) {
        const data = await response.json();
        setConnectorStatus(data.data || {});
      }
    } catch (error) {
      console.error('Error fetching connector status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectService = async (provider: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/connectors/${provider}/${user?.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Refresh status after disconnection
        fetchConnectorStatus();
      }
    } catch (error) {
      console.error('Error disconnecting service:', error);
    }
  };

  const connectorConfig = [
    {
      id: 'google_gmail',
      name: 'Gmail',
      description: 'Access your email conversations and writing style',
      icon: '📧'
    },
    {
      id: 'google_calendar',
      name: 'Google Calendar',
      description: 'Understand your schedule and time management patterns',
      icon: '📅'
    },
    {
      id: 'google_drive',
      name: 'Google Drive',
      description: 'Analyze your documents and teaching materials',
      icon: '📁'
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Learn from your workplace communication style',
      icon: '💬'
    },
    {
      id: 'teams',
      name: 'Microsoft Teams',
      description: 'Integrate with your Teams conversations',
      icon: '👥'
    },
    {
      id: 'discord',
      name: 'Discord',
      description: 'Connect with your Discord communities',
      icon: '🎮'
    }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Header */}
      <div
        className="px-6 py-4 border-b"
        style={{
          backgroundColor: 'var(--_color-theme---surface)',
          borderColor: 'var(--_color-theme---border)'
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/get-started')}
              className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm"
              style={{ color: 'var(--_color-theme---text)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <div>
              <h1
                className="text-2xl font-bold mb-1"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'var(--_color-theme---text)'
                }}
              >
                Settings
              </h1>
              <p
                className="text-sm"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
              >
                Manage your account, connected services, and preferences
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto pt-8 pb-20 px-6">
        <div className="space-y-8">

          {/* Account Information */}
          <section
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: 'var(--_color-theme---surface)',
              borderColor: 'var(--_color-theme---border)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
              <h2
                className="text-xl font-semibold"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'var(--_color-theme---text)'
                }}
              >
                Account Information
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--_color-theme---text)' }}
                >
                  Name
                </label>
                <div
                  className="p-3 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--_color-theme---background)',
                    borderColor: 'var(--_color-theme---border)',
                    color: 'var(--_color-theme---text)'
                  }}
                >
                  {user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not set'}
                </div>
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--_color-theme---text)' }}
                >
                  Email
                </label>
                <div
                  className="p-3 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--_color-theme---background)',
                    borderColor: 'var(--_color-theme---border)',
                    color: 'var(--_color-theme---text)'
                  }}
                >
                  {user?.email}
                </div>
              </div>
            </div>
          </section>

          {/* Connected Services */}
          <section
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: 'var(--_color-theme---surface)',
              borderColor: 'var(--_color-theme---border)'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Link className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
                <h2
                  className="text-xl font-semibold"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    color: 'var(--_color-theme---text)'
                  }}
                >
                  Connected Services
                </h2>
              </div>
              <button
                onClick={fetchConnectorStatus}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: 'var(--_color-theme---surface-raised)',
                  color: 'var(--_color-theme---text)',
                  border: `1px solid var(--_color-theme---border)`
                }}
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            <p
              className="text-sm mb-6"
              style={{ color: 'var(--_color-theme---text-secondary)' }}
            >
              These services help your digital twin understand your communication style and preferences.
            </p>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--_color-theme---accent)' }} />
                <span className="ml-2" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                  Loading connection status...
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {connectorConfig.map((connector) => {
                  const isConnected = connectorStatus[connector.id]?.connected;

                  return (
                    <div
                      key={connector.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--_color-theme---background)',
                        borderColor: 'var(--_color-theme---border)'
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{connector.icon}</span>
                        <div>
                          <h3
                            className="font-medium"
                            style={{ color: 'var(--_color-theme---text)' }}
                          >
                            {connector.name}
                          </h3>
                          <p
                            className="text-sm"
                            style={{ color: 'var(--_color-theme---text-secondary)' }}
                          >
                            {connector.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {isConnected ? (
                          <>
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span
                                className="text-sm font-medium text-green-600"
                                style={{ color: '#10B981' }}
                              >
                                Connected
                              </span>
                            </div>
                            <button
                              onClick={() => handleDisconnectService(connector.id)}
                              className="px-3 py-1.5 rounded-lg text-sm transition-colors border border-red-300 text-red-600 hover:bg-red-50"
                            >
                              Disconnect
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4" style={{ color: 'var(--_color-theme---text-secondary)' }} />
                            <span
                              className="text-sm"
                              style={{ color: 'var(--_color-theme---text-secondary)' }}
                            >
                              Not connected
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              className="mt-6 p-4 rounded-lg border-l-4"
              style={{
                backgroundColor: 'var(--_color-theme---surface-raised)',
                borderLeftColor: 'var(--_color-theme---accent)',
                borderColor: 'var(--_color-theme---border)'
              }}
            >
              <p
                className="text-sm"
                style={{ color: 'var(--_color-theme---text)' }}
              >
                <strong>Note:</strong> To connect new services, go back to the{' '}
                <button
                  onClick={() => navigate('/get-started')}
                  className="underline hover:opacity-70"
                  style={{ color: 'var(--_color-theme---accent)' }}
                >
                  onboarding page
                </button>{' '}
                where you can manage your data connections.
              </p>
            </div>
          </section>

          {/* Privacy & Security */}
          <section
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: 'var(--_color-theme---surface)',
              borderColor: 'var(--_color-theme---border)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
              <h2
                className="text-xl font-semibold"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'var(--_color-theme---text)'
                }}
              >
                Privacy & Security
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3
                    className="font-medium"
                    style={{ color: 'var(--_color-theme---text)' }}
                  >
                    Data Usage Consent
                  </h3>
                  <p
                    className="text-sm"
                    style={{ color: 'var(--_color-theme---text-secondary)' }}
                  >
                    Allow the platform to analyze your connected data to improve your digital twin
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3
                    className="font-medium"
                    style={{ color: 'var(--_color-theme---text)' }}
                  >
                    Analytics
                  </h3>
                  <p
                    className="text-sm"
                    style={{ color: 'var(--_color-theme---text-secondary)' }}
                  >
                    Share anonymous usage data to help improve the platform
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
            </div>
          </section>

          {/* Additional Settings */}
          <section
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: 'var(--_color-theme---surface)',
              borderColor: 'var(--_color-theme---border)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Palette className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
              <h2
                className="text-xl font-semibold"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'var(--_color-theme---text)'
                }}
              >
                Preferences
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <h3
                  className="font-medium mb-2"
                  style={{ color: 'var(--_color-theme---text)' }}
                >
                  Voice Settings
                </h3>
                <button
                  onClick={() => navigate('/voice-settings')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: 'var(--_color-theme---surface-raised)',
                    color: 'var(--_color-theme---text)',
                    border: `1px solid var(--_color-theme---border)`
                  }}
                >
                  Configure Voice Clone
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h3
                  className="font-medium mb-2"
                  style={{ color: 'var(--_color-theme---text)' }}
                >
                  Twin Builder
                </h3>
                <button
                  onClick={() => navigate('/twin-builder')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: 'var(--_color-theme---surface-raised)',
                    color: 'var(--_color-theme---text)',
                    border: `1px solid var(--_color-theme---border)`
                  }}
                >
                  Manage Your Digital Twin
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default Settings;