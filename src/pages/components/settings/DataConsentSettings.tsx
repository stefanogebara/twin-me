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
  consents: Consent[];
  loadingConsents: boolean;
  revokingConsent: string | null;
  handleRevokeConsent: (consentType: string, platform: string) => void;
  cardStyle: string;
}

const DataConsentSettings: React.FC<DataConsentSettingsProps> = ({
  consents,
  loadingConsents,
  revokingConsent,
  handleRevokeConsent,
  cardStyle,
}) => {
  return (
    <section className={`p-5 ${cardStyle}`}>
      <div className="flex items-center gap-3 mb-4">
        <Shield className="w-5 h-5" style={{ color: '#A78BFA' }} />
        <h2 className="heading-serif text-base">
          Data Consent
        </h2>
      </div>
      <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
        Manage the permissions you've granted for platform data access.
      </p>

      {loadingConsents ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--foreground)' }} />
        </div>
      ) : consents.length === 0 ? (
        <div
          className="text-sm py-4 text-center rounded-xl"
          style={{
            color: 'var(--text-secondary)',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
          }}
        >
          Platform access is managed through your connected platforms above. You can disconnect any platform at any time to revoke access.
        </div>
      ) : (
        <div className="space-y-2">
          {consents.map((consent) => (
            <div
              key={consent.id}
              className="flex items-center justify-between p-3 rounded-xl"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div>
                <h3 className="text-sm" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, color: 'var(--foreground)' }}>
                  {consent.platform
                    ? `${consent.platform.charAt(0).toUpperCase() + consent.platform.slice(1).replace(/_/g, ' ')} - ${consent.consent_type.replace(/_/g, ' ')}`
                    : consent.consent_type.replace(/_/g, ' ')}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
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
