/**
 * BriefingPage — full-page home for the daily Brief.
 *
 * replan-2026-06-10 desktop-product P2: the desktop morning toast and the
 * Hummingbird panel need a reachable destination for the rich Brief card.
 * Previously the structured card only lived inside the bundled onboarding
 * page and the dashboard; a steady-state user who tapped the toast had
 * nowhere to land. This route is that destination — the desktop notification
 * deep-links to /briefing, and the card is the same self-fetching
 * MorningBriefingCard used on the dashboard (shared ['morning-briefing']
 * query cache, so no extra fetch when navigating from the dashboard).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import MorningBriefingCard from '@/components/chat/MorningBriefingCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const BriefingPage: React.FC = () => {
  const navigate = useNavigate();
  useDocumentTitle('Your Brief');

  // Seed the composer via ?prefill= (the reliable deep-link surface;
  // location.state has a latent infinite-render crash in TalkToTwin — see
  // the note at TalkToTwin.tsx:210).
  const handleAskTwin = (message: string) => {
    navigate(`/talk-to-twin?prefill=${encodeURIComponent(message)}`);
  };

  return (
    <div className="min-h-screen w-full flex justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-[640px]">
        <MorningBriefingCard onAskTwin={handleAskTwin} />
      </div>
    </div>
  );
};

export default BriefingPage;
