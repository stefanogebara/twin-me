import { useNavigate } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Platform {
  name: string;
  icon: React.ReactNode;
  key: string;
  color: string;
  connected: boolean | undefined;
}

interface ContextItem {
  type: 'memory' | 'fact' | 'platform' | 'personality';
  label: string;
  value: string;
  timestamp?: string;
  icon?: React.ReactNode;
}

interface ContextSidebarProps {
  showContext: boolean;
  onClose: () => void;
  platforms: Platform[];
  connectedPlatforms: Platform[];
  contextItems: ContextItem[];
  isLoadingContext: boolean;
  connectedCount: number;
  messageCount: number;
}

export const ContextSidebar = ({
  showContext,
  onClose,
  platforms,
  contextItems,
  isLoadingContext,
  connectedCount,
  messageCount,
}: ContextSidebarProps) => {
  const navigate = useNavigate();

  return (
    <aside
      aria-label="Chat context"
      className={cn(
        "w-64 hidden md:block overflow-y-auto",
        !showContext && "md:hidden"
      )}
      style={{
        background: 'var(--glass-surface-bg)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        borderLeft: '1px solid var(--glass-surface-border)',
      }}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span
            className="text-[11px] font-medium tracking-widest uppercase"
            style={{ color: '#10b77f' }}
          >
            Context
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            aria-label="Close context panel"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Data Sources */}
        <div className="mb-6">
          <h3
            className="text-[11px] font-medium tracking-widest uppercase mb-3"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            Sources
          </h3>
          <div className="space-y-2">
            {platforms.map((platform) => (
              <div
                key={platform.key}
                className="flex items-center justify-between py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: platform.connected ? platform.color : 'rgba(255,255,255,0.15)' }}>
                    {platform.icon}
                  </span>
                  <span
                    className="text-[13px]"
                    style={{ color: platform.connected ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }}
                  >
                    {platform.name}
                  </span>
                </div>
                {platform.connected ? (
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: platform.color }}
                  />
                ) : (
                  <button
                    onClick={() => navigate('/get-started')}
                    className="text-[11px] transition-opacity hover:opacity-70"
                    style={{ color: '#10b77f' }}
                  >
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} />

        {/* Active Context */}
        <div className="mb-6">
          <h3
            className="text-[11px] font-medium tracking-widest uppercase mb-3"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            Active Context
          </h3>
          {isLoadingContext ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#10b77f' }} />
            </div>
          ) : contextItems.filter(i => i.type !== 'platform').length > 0 ? (
            <div className="space-y-3">
              {contextItems.filter(i => i.type !== 'platform').map((item, idx) => (
                <div key={idx}>
                  <span
                    className="text-[11px] font-medium tracking-wider uppercase"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    {item.label}
                  </span>
                  <p
                    className="text-[13px] leading-relaxed mt-0.5"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Context loads when you chat
            </p>
          )}
        </div>

        <div className="mb-6" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} />

        {/* Stats */}
        <div className="flex gap-6">
          <div>
            <div
              className="text-lg font-medium"
              style={{ color: 'var(--foreground)', opacity: 0.8 }}
            >
              {connectedCount || '--'}
            </div>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Platforms</div>
          </div>
          <div>
            <div
              className="text-lg font-medium"
              style={{ color: 'var(--foreground)', opacity: 0.8 }}
            >
              {messageCount}
            </div>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Messages</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
