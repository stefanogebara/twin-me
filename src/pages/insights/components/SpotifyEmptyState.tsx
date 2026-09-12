import React from 'react';
import { InsightsNotice } from './InsightsKit';

interface SpotifyEmptyStateProps {
  navigate: (path: string) => void;
  /** Backend `notConnected` flag — decides Connect CTA vs "collecting data" row (audit-2026-06-10). */
  notConnected?: boolean;
}

export const SpotifyEmptyState: React.FC<SpotifyEmptyStateProps> = ({
  navigate,
  notConnected = false,
}) => {
  return (
    <InsightsNotice
      notConnected={notConnected}
      platform="Spotify"
      connectLine="Your twin will notice patterns in your listening."
      title="Your twin is listening"
      line="Patterns show up as your music syncs."
      onConnect={() => navigate('/get-started')}
    />
  );
};
