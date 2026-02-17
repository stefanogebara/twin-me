import React from 'react';
import { Loader2, Shield } from 'lucide-react';

interface Consent {
  id: string;
  consent_type: string;
  platform: string | null;
  granted: boolean;
  consent_version: string;
  granted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface DataConsentSettingsProps {
  theme: string;
  consents: Consent[];
  loadingConsents: boolean;
  revokingConsent: string | null;
  handleRevokeConsent: (consentType: string, platform: string) => void;
  cardStyle: React.CSSProperties;
}

const DataConsentSettings: React.FC<DataConsentSettingsProps> = ({
  theme,
  consents,
  loadingConsents,
  revokingConsent,
  handleRevokeConsent,
  cardStyle,
}) => {
  return (
    <section className="rounded-2xl p-5" style={cardStyle}>
      <div className="flex items-center gap-3 mb-4">
        <Shield className="w-5 h-5" style={{ color: '#A78BFA' }} />
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
          Data Consent
        </h2>
      </div>
      <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-body)', color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
        Manage the permissions you've granted for platform data access.
      </p>

      {loadingConsents ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
        </div>
      ) : consents.length === 0 ? (
        <div
          className="text-sm py-4 text-center rounded-xl"
          style={{
            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c',
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          }}
        >
          No active consents. Connect a platform to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {consents.map((consent) => (
            <div
              key={consent.id}
              className="flex items-center justify-between p-3 rounded-xl"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.04)',
              }}
            >
              <div>
                <h3 className="text-sm" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                  {consent.platform
                    ? `${consent.platform.charAt(0).toUpperCase() + consent.platform.slice(1).replace(/_/g, ' ')} - ${consent.consent_type.replace(/_/g, ' ')}`
                    : consent.consent_type.replace(/_/g, ' ')}
                </h3>
                <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>
                  Granted {consent.granted_at ? new Date(consent.granted_at).toLocaleDateString() : 'N/A'}
                  {' '}&middot; v{consent.consent_version}
                </p>
              </div>
              <button
                onClick={() => handleRevokeConsent(consent.consent_type, consent.platform || '')}
                disabled={revokingConsent === `${consent.consent_type}:${consent.platform}`}
                className="text-xs px-3 py-1.5 rounded-lg transition-all"
                style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
              >
                {revokingConsent === `${consent.consent_type}:${consent.platform}` ? '...' : 'Revoke'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default DataConsentSettings;
