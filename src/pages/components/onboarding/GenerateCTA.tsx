/**
 * GenerateCTA — "Reveal Your Soul Archetype" button section with
 * platform count summary and skip option.
 */

import React from 'react';
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { DataProvider } from '@/types/data-integration';

interface GenerateCTAProps {
  connectedServices: DataProvider[];
  activeConnections: DataProvider[];
  expiredConnections: DataProvider[];
  isGenerating: boolean;
  onGenerate: () => void;
  onSkip: () => void;
}

export const GenerateCTA: React.FC<GenerateCTAProps> = ({
  connectedServices,
  activeConnections,
  expiredConnections,
  isGenerating,
  onGenerate,
  onSkip,
}) => {
  if (connectedServices.length === 0) return null;

  return (
    <>
      <div className="my-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
      <div className="text-center py-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <CheckCircle2 className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
          <span
            className="text-[13px]"
            style={{ color: 'rgba(255,255,255,0.40)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            {activeConnections.length} platform{activeConnections.length !== 1 ? 's' : ''} active
            {expiredConnections.length > 0 && (
              <span className="ml-1" style={{ color: '#C9B99A' }}>
                ({expiredConnections.length} expired)
              </span>
            )}
          </span>
        </div>
        <button
          onClick={onGenerate}
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
            style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            Skip for now — I'll connect later
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </>
  );
};
