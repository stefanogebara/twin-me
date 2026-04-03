/**
 * OnboardingHeader — Page header, demo notice, and connection status bar
 * for the InstantTwinOnboarding flow.
 */

import React from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { DataProvider } from '@/types/data-integration';

interface OnboardingHeaderProps {
  isDemoMode: boolean;
  connectedServices: DataProvider[];
  activeConnections: DataProvider[];
  expiredConnections: DataProvider[];
  currentStep: number;
}

export const OnboardingHeader: React.FC<OnboardingHeaderProps> = ({
  isDemoMode,
  connectedServices,
  activeConnections,
  expiredConnections,
  currentStep,
}) => (
  <>
    {/* Header */}
    <h1
      className="mb-2"
      style={{
        fontFamily: "'Instrument Serif', Georgia, serif",
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
      style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
    >
      Link your digital footprints to build your soul signature
    </p>

    {/* Demo notice */}
    {isDemoMode && (
      <div
        className="flex items-center gap-2 mb-8 text-[13px]"
        style={{ color: 'rgba(255,255,255,0.40)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        <Info className="w-4 h-4 flex-shrink-0" />
        <span>Demo mode — all platforms shown as connected with sample data.</span>
      </div>
    )}

    {/* Connection status */}
    {connectedServices.length > 0 && currentStep === 1 && (
      <div
        className="flex items-center gap-3 mb-8 px-4 py-3 rounded-xl"
        style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <CheckCircle2
          className="w-4 h-4 flex-shrink-0"
          style={{ color: expiredConnections.length > 0 ? '#C9B99A' : '#10b981' }}
        />
        <div>
          <span
            className="text-[13px]"
            style={{ color: 'rgba(255,255,255,0.60)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            {activeConnections.length} platform{activeConnections.length !== 1 ? 's' : ''} active
          </span>
          {expiredConnections.length > 0 && (
            <span
              className="text-[13px] ml-2"
              style={{ color: '#C9B99A', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
            >
              ({expiredConnections.length} need{expiredConnections.length === 1 ? 's' : ''} reconnection)
            </span>
          )}
        </div>
      </div>
    )}
  </>
);
