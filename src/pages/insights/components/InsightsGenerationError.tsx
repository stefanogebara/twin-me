import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface InsightsGenerationErrorProps {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
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
}) => {
  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="w-12 h-12" style={{ color: 'rgba(255,255,255,0.3)' }} />
        <p
          className="text-sm text-center"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
        >
          {message}
        </p>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="flex items-center gap-2 px-4 py-2 rounded-[100px] text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: '#F5F5F4', color: '#110f0f' }}
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
          Try again
        </button>
      </div>
    </div>
  );
};
