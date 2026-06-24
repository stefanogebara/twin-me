/**
 * GenerateCTA — "Reveal Your Soul Archetype" button section with
 * platform count summary and skip option.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { DataProvider } from '@/types/data-integration';
import { authFetch } from '@/services/api/apiBase';

interface GenerateCTAProps {
  connectedServices: DataProvider[];
  // Canonical counts from usePlatformsSummary (same source as OnboardingHeader)
  // so the count matches the rest of the app (2026-06-08 audit).
  activeCount: number;
  reconnectCount: number;
  isGenerating: boolean;
  onGenerate: () => void;
  onSkip: () => void;
}

export const GenerateCTA: React.FC<GenerateCTAProps> = ({
  connectedServices,
  activeCount,
  reconnectCount,
  isGenerating,
  onGenerate,
  onSkip,
}) => {
  const navigate = useNavigate();

  // audit-2026-05-12 M10: when the user already has a generated archetype,
  // "Reveal Your Soul Archetype" is misleading — there's nothing to reveal.
  // Switch the CTA to take them straight to /identity. The original
  // onGenerate flow is still available via /identity → re-roll.
  const { data: existingSignature } = useQuery({
    queryKey: ['soul-signature', 'has-archetype'],
    queryFn: async () => {
      // Bug discovered audit-2026-05-13: previous version hit /soul-signature
      // (the API root info envelope), which has no archetype_name. The actual
      // archetype lives at /soul-signature/archetype.
      const res = await authFetch('/soul-signature/archetype');
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data?.archetype_name ? true : false;
    },
    staleTime: 5 * 60 * 1000,
  });
  const hasArchetype = existingSignature === true;

  // audit-2026-06-10: do NOT early-return on zero platforms — that made the
  // "Skip for now" affordance (gated on connectedServices.length === 0 below)
  // unreachable and left zero-platform users with no forward CTA. Render the
  // zero-platform layout: the primary CTA is disabled via its ternaries and
  // the Skip path (onSkip + onboarding_skipped_no_platforms funnel) is shown.

  return (
    <>
      <div className="my-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
      <div className="text-center py-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <CheckCircle2 className="w-4 h-4" style={{ color: 'rgba(255, 255, 255, 0.55)' }} />
          <span
            className="text-[13px]"
            style={{ color: 'rgba(255, 255, 255, 0.55)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            {activeCount} platform{activeCount !== 1 ? 's' : ''} active
            {reconnectCount > 0 && (
              <span className="ml-1" style={{ color: '#C9B99A' }}>
                {/* Combined expired + stale warning — "attention", not "reconnection"
                    (batch-3 display convention: only expired demands a reconnect). */}
                ({reconnectCount} need{reconnectCount === 1 ? 's' : ''} attention)
              </span>
            )}
          </span>
        </div>
        <button
          onClick={hasArchetype ? () => navigate('/identity') : onGenerate}
          disabled={isGenerating || connectedServices.length === 0}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[14px] font-medium transition-all duration-150 hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: connectedServices.length > 0 ? '#F5F5F4' : 'rgba(245,245,244,0.1)',
            color: connectedServices.length > 0 ? '#110f0f' : 'rgba(245,245,244,0.4)',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            cursor: isGenerating || connectedServices.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Discovering your archetype...
            </>
          ) : hasArchetype ? (
            <>
              View your Soul Signature
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              Reveal Your Soul Archetype
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
        {connectedServices.length === 0 && !isGenerating && (
          <button
            onClick={onSkip}
            className="inline-flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70 mt-3"
            style={{ color: 'rgba(255, 255, 255, 0.55)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            Skip for now — I'll connect later
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </>
  );
};
