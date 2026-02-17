import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Play, Zap } from 'lucide-react';
import { GlassPanel } from '../../../components/layout/PageLayout';
import { getPlatformLogo } from '@/components/PlatformLogos';
import { ThemeColors } from './types';

interface PipelineStatusCardProps {
  isPipelineRunning: boolean;
  currentStage: string | null;
  hasTwin: boolean;
  connectedCount: number;
  connectedProviders: string[];
  isForming: boolean;
  formTwin: (force: boolean) => void;
  formError: { message: string } | null;
  colors: ThemeColors;
}

export const PipelineStatusCard: React.FC<PipelineStatusCardProps> = ({
  isPipelineRunning,
  currentStage,
  hasTwin,
  connectedCount,
  connectedProviders,
  isForming,
  formTwin,
  formError,
  colors
}) => {
  const { textColor, textMuted, textFaint, hoverBg, theme } = colors;

  return (
    <GlassPanel className="!p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: isPipelineRunning
                ? 'rgba(99, 102, 241, 0.1)'
                : hasTwin
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(245, 158, 11, 0.1)'
            }}
          >
            {isPipelineRunning ? (
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#6366F1' }} />
            ) : hasTwin ? (
              <CheckCircle2 className="w-5 h-5" style={{ color: '#10B981' }} />
            ) : (
              <AlertCircle className="w-5 h-5" style={{ color: '#F59E0B' }} />
            )}
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
              Twin Formation
            </h3>
            <p className="text-sm" style={{ color: textMuted }}>
              {isPipelineRunning
                ? `Stage: ${currentStage || 'Starting...'}`
                : hasTwin
                  ? 'Your digital twin is ready'
                  : 'Connect platforms to form your twin'}
            </p>
          </div>
        </div>
        {!isPipelineRunning && connectedCount > 0 && (
          <button
            onClick={() => formTwin(false)}
            disabled={isForming}
            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
            style={{
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              color: '#6366F1',
              border: '1px solid rgba(99, 102, 241, 0.2)'
            }}
          >
            <Play className="w-4 h-4" />
            {hasTwin ? 'Refresh Twin' : 'Form Twin'}
          </button>
        )}
      </div>

      {connectedProviders.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-4">
          {connectedProviders.map(provider => {
            const platformColors: Record<string, string> = {
              spotify: '#1DB954', whoop: '#06B6D4', google_calendar: '#6366F1',
              youtube: '#FF0000', twitch: '#9146FF', discord: '#5865F2',
              reddit: '#FF4500', github: '#333333', gmail: '#EA4335',
              outlook: '#0078D4', linkedin: '#0A66C2'
            };
            const platformNames: Record<string, string> = {
              spotify: 'spotify', whoop: 'whoop', google_calendar: 'calendar',
              youtube: 'youtube', twitch: 'twitch', discord: 'discord',
              reddit: 'reddit', github: 'github', gmail: 'gmail',
              outlook: 'outlook', linkedin: 'linkedin'
            };
            const color = platformColors[provider] || textFaint;
            const name = platformNames[provider] || provider;
            const LogoComponent = getPlatformLogo(provider);

            return (
              <div
                key={provider}
                className="p-3 rounded-xl transition-all duration-200"
                style={{
                  backgroundColor: hoverBg,
                  border: `1px solid ${color}25`
                }}
              >
                <div className="flex items-center gap-2">
                  {LogoComponent ? (
                    <LogoComponent className="w-4 h-4" />
                  ) : (
                    <Zap className="w-4 h-4" style={{ color }} />
                  )}
                  <span className="text-xs font-medium capitalize" style={{ color: textColor }}>
                    {name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formError && (
        <div className="mt-4 p-3 rounded-xl text-sm" style={{
          backgroundColor: 'rgba(220, 38, 38, 0.08)',
          border: '1px solid rgba(220, 38, 38, 0.15)',
          color: theme === 'dark' ? '#fca5a5' : '#991b1b'
        }}>
          Pipeline error: {formError.message}
        </div>
      )}
    </GlassPanel>
  );
};
