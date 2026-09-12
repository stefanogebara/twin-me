/**
 * GenerateCTA — the page's one call to action (48/12): reveal the archetype,
 * or go to it when one exists, and a skip for users with nothing connected.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import { DataProvider } from '@/types/data-integration';
import { authFetch } from '@/services/api/apiBase';

interface GenerateCTAProps {
  connectedServices: DataProvider[];
  // Canonical counts from usePlatformsSummary (same source as OnboardingHeader).
  // The header carries them now; the old second copy of the status line here
  // repeated it word for word.
  activeCount: number;
  reconnectCount: number;
  isGenerating: boolean;
  onGenerate: () => void;
  onSkip: () => void;
}

export const GenerateCTA: React.FC<GenerateCTAProps> = ({
  connectedServices,
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
  // zero-platform layout: the primary CTA is disabled and the Skip path
  // (onSkip + onboarding_skipped_no_platforms funnel) is shown.

  return (
    <div className="rs-cta">
      <button
        type="button"
        onClick={hasArchetype ? () => navigate('/identity') : onGenerate}
        disabled={isGenerating || connectedServices.length === 0}
        className="n-btn n-btn--primary pb-cta"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Finding your archetype
          </>
        ) : hasArchetype ? (
          <>
            View your Soul Signature
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </>
        ) : (
          <>
            Reveal your soul archetype
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </>
        )}
      </button>
      {connectedServices.length === 0 && !isGenerating && (
        <button type="button" onClick={onSkip} className="rs-link">
          Skip for now, I'll connect later
        </button>
      )}
    </div>
  );
};
