/**
 * OnboardingHeader — Page header, demo notice, and connection status bar
 * for the InstantTwinOnboarding flow.
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { DataProvider } from '@/types/data-integration';

interface OnboardingHeaderProps {
  connectedServices: DataProvider[];
  // Canonical counts from usePlatformsSummary (single source of truth) so the
  // onboarding header agrees with /dashboard, /talk-to-twin, etc. It previously
  // counted stale-but-connected platforms as active (2026-06-08 audit).
  activeCount: number;
  reconnectCount: number;
  currentStep: number;
}

export const OnboardingHeader: React.FC<OnboardingHeaderProps> = ({
  connectedServices,
  activeCount,
  reconnectCount,
  currentStep,
}) => (
  <>
    {/* Header */}
    <h1
      className="mb-2"
      style={{
        fontFamily: "var(--font-heading)",
        fontStyle: 'italic',
        fontSize: '32px',
        fontWeight: 400,
        color: 'var(--foreground)',
        letterSpacing: '-0.03em',
      }}
    >
      Connect Your Platforms
    </h1>
    <p
      className="text-[14px] leading-relaxed mb-10"
      style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}
    >
      Link your digital footprints to build your soul signature
    </p>

    {/* Connection status */}
    {connectedServices.length > 0 && currentStep === 1 && (
      <div
        className="flex items-center gap-3 mb-8 px-4 py-3 rounded-xl"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border-glass)',
        }}
      >
        <CheckCircle2
          className="w-4 h-4 flex-shrink-0"
          style={{ color: reconnectCount > 0 ? '#C9B99A' : '#10b981' }}
        />
        <div>
          <span
            className="text-[13px]"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}
          >
            {activeCount} platform{activeCount !== 1 ? 's' : ''} active
          </span>
          {reconnectCount > 0 && (
            <span
              className="text-[13px] ml-2"
              style={{ color: '#C9B99A', fontFamily: 'var(--font-ui)' }}
            >
              {/* reconnectCount = expired + stale; stale is not an auth failure,
                  so the combined warning says "need attention", never "reconnect"
                  (batch-3 display convention). */}
              ({reconnectCount} need{reconnectCount === 1 ? 's' : ''} attention)
            </span>
          )}
        </div>
      </div>
    )}
  </>
);
