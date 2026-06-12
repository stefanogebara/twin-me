import React from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Subtle stale-while-revalidate indicator (audit-2026-06-10): shown while a
 * user-triggered refresh regenerates the reflection, so the previous insights
 * stay rendered instead of swapping back to the page skeleton.
 */
export const RefreshingIndicator: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return (
    <div
      className="flex items-center gap-2 mb-6 text-xs"
      style={{ color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif" }}
      role="status"
      aria-live="polite"
    >
      <RefreshCw className="w-3 h-3 animate-spin" />
      <span>Refreshing...</span>
    </div>
  );
};
