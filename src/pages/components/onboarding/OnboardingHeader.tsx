/**
 * OnboardingHeader — the page title and the connection status line for the
 * InstantTwinOnboarding flow, as the page kit's PageHead.
 */

import React from 'react';
import { DataProvider } from '@/types/data-integration';
import { PageHead } from '@/components/register';

interface OnboardingHeaderProps {
  connectedServices: DataProvider[];
  // Canonical counts from usePlatformsSummary (single source of truth) so the
  // onboarding header agrees with /dashboard, /talk-to-twin, etc. It previously
  // counted stale-but-connected platforms as active (2026-06-08 audit).
  activeCount: number;
  reconnectCount: number;
  currentStep: number;
  /** The header's one action (the "tell your story" way round). */
  action?: React.ReactNode;
}

export const OnboardingHeader: React.FC<OnboardingHeaderProps> = ({
  connectedServices,
  activeCount,
  reconnectCount,
  currentStep,
  action,
}) => (
  <PageHead
    title="Connect your platforms"
    line={connectedServices.length > 0 && currentStep === 1 ? (
      <>
        {activeCount} platform{activeCount !== 1 ? 's' : ''} active
        {reconnectCount > 0 && (
          // reconnectCount = expired + stale; stale is not an auth failure,
          // so the combined warning says "need attention", never "reconnect"
          // (batch-3 display convention). Ink at 500, not the old gold (1.85:1).
          <> · <span className="rs-strong">{reconnectCount} need{reconnectCount === 1 ? 's' : ''} attention</span></>
        )}
      </>
    ) : 'Each one helps your twin know you better.'}
    action={action}
  />
);
