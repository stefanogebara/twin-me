import React from 'react';
import { InsightsError } from './InsightsKit';

interface InsightsGenerationErrorProps {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  /** The page's title, so the error keeps the page it belongs to. */
  title?: string;
}

/**
 * Inline error state for non-transient insight generation failures
 * (audit-2026-06-10). The platform IS connected here, so this offers a retry
 * instead of the misleading "Connect <platform>" CTA.
 */
export const InsightsGenerationError: React.FC<InsightsGenerationErrorProps> = ({
  message,
  onRetry,
  retrying = false,
  title = 'Insights',
}) => {
  return <InsightsError title={title} message={message} actionLabel="Try again" onAction={onRetry} busy={retrying} />;
};
