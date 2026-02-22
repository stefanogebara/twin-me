import React from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Plus,
  Link2,
} from 'lucide-react';
import { PlatformLogo } from '@/components/PlatformLogos';
import { GlassPanel } from '@/components/layout/PageLayout';

interface PlatformStatus {
  id: string;
  name: string;
  connected: boolean;
  expired?: boolean;
  color: string;
}

const PLATFORM_CONFIG: Record<string, { name: string; color: string; brandColor: string }> = {
  spotify: { name: 'Spotify', color: 'text-green-500', brandColor: '#1DB954' },
  google_calendar: { name: 'Calendar', color: 'text-blue-500', brandColor: '#4285F4' },
  whoop: { name: 'Whoop', color: 'text-cyan-500', brandColor: '#00A5E0' },
  youtube: { name: 'YouTube', color: 'text-red-500', brandColor: '#FF0000' },
  twitch: { name: 'Twitch', color: 'text-purple-500', brandColor: '#9146FF' },
};

interface ConnectedPlatformsSectionProps {
  platforms: PlatformStatus[];
  onNavigate: (path: string) => void;
}

export const ConnectedPlatformsSection: React.FC<ConnectedPlatformsSectionProps> = ({
  platforms,
  onNavigate,
}) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-1 h-5 rounded-full"
            style={{
              background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1))'
            }}
          />
          <h3
            className="text-sm uppercase tracking-wider"
            style={{ color: '#8A857D' }}
          >
            Connected Platforms
          </h3>
        </div>
        <button
          onClick={() => onNavigate('/get-started')}
          className="text-sm flex items-center gap-1 transition-colors hover:opacity-80"
          style={{ color: '#8A857D' }}
        >
          Manage
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {platforms.length > 0 ? (
        <div className="flex gap-3 flex-wrap">
          {platforms.map((platform) => {
            const config = PLATFORM_CONFIG[platform.id];
            const brandColor = config?.brandColor || '#1F1C18';
            return (
              <button
                key={platform.id}
                onClick={() => onNavigate('/get-started')}
                className="px-4 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: platform.connected ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                  borderLeft: platform.connected && !platform.expired
                    ? `3px solid ${brandColor}`
                    : undefined,
                  border: platform.expired
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : !platform.connected
                    ? '1px solid rgba(0, 0, 0, 0.06)'
                    : undefined,
                  borderTop: platform.connected && !platform.expired
                    ? '1px solid rgba(0, 0, 0, 0.06)'
                    : undefined,
                  borderRight: platform.connected && !platform.expired
                    ? '1px solid rgba(0, 0, 0, 0.06)'
                    : undefined,
                  borderBottom: platform.connected && !platform.expired
                    ? '1px solid rgba(0, 0, 0, 0.06)'
                    : undefined,
                }}
              >
                <PlatformLogo platform={platform.id} className="w-4 h-4" />
                <span
                  className="text-sm"
                  style={{ color: '#1F1C18' }}
                >
                  {platform.name}
                </span>
                {platform.connected && !platform.expired ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : platform.expired ? (
                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <Plus className="w-4 h-4 opacity-50" />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <GlassPanel className="text-center py-8">
          <Link2
            className="w-10 h-10 mx-auto mb-3 opacity-30"
            style={{ color: '#1F1C18' }}
          />
          <p
            className="text-sm mb-4"
            style={{ color: '#8A857D' }}
          >
            Connect your first platform to start building your digital twin
          </p>
          <button
            onClick={() => onNavigate('/get-started')}
            className="btn-cta-app inline-flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Connect Platforms
          </button>
        </GlassPanel>
      )}
    </div>
  );
};
