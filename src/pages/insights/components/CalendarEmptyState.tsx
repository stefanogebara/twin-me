import React from 'react';
import { InsightsNotice } from './InsightsKit';

interface CalendarEmptyStateProps {
  onConnect: () => void;
  /** Backend `notConnected` flag — decides Connect CTA vs "collecting data" row (audit-2026-06-10). */
  notConnected?: boolean;
}

export const CalendarEmptyState: React.FC<CalendarEmptyStateProps> = ({ onConnect, notConnected = false }) => {
  return (
    <InsightsNotice
      notConnected={notConnected}
      platform="Calendar"
      connectLine="Your twin will notice how you structure your time."
      title="Your twin is studying your schedule"
      line="Patterns show up as your calendar fills."
      onConnect={onConnect}
    />
  );
};
