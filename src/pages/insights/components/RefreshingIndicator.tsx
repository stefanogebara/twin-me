import React from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Subtle stale-while-revalidate indicator (audit-2026-06-10): shown while a
 * user-triggered refresh regenerates the reflection, so the previous insights
 * stay rendered instead of swapping back to the page skeleton.
 *
 * audit-2026-07-03: stays mounted at all times (visibility toggled via style,
 * not conditional unmount) so the aria-live region is already present in the
 * DOM when "Refreshing..." appears — screen readers only announce content
 * changes to a live region that existed before the mutation.
 */
export const RefreshingIndicator: React.FC<{ visible: boolean }> = ({ visible }) => {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        color: 'var(--rg-ink-3)',
        fontWeight: 'var(--rg-weight-line)' as React.CSSProperties['fontWeight'],
        marginBottom: visible ? 24 : 0,
        height: visible ? 'auto' : 0,
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
      }}
      role="status"
      aria-live="polite"
    >
      {visible && (
        <>
          <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
          <span>Refreshing...</span>
        </>
      )}
    </div>
  );
};
