import { useNavigate } from 'react-router-dom';
import {
  Loader2, X, Clock, Lightbulb
} from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';
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
  connectedPlatforms,
  contextItems,
  isLoadingContext,
  connectedCount,
  messageCount,
}: ContextSidebarProps) => {
  const navigate = useNavigate();

  return (
    <aside
      className={cn(
        "w-72 border-l hidden md:block overflow-y-auto",
        !showContext && "md:hidden"
      )}
      style={{
        background: 'var(--glass-surface-bg)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        borderColor: 'var(--glass-surface-border)',
      }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-sm font-medium flex items-center gap-2"
            style={{ color: 'var(--foreground)' }}
          >
            <img src="/images/backgrounds/flower-hero.png" alt="" className="w-4 h-4 object-contain" />
            Twin Context
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Data Sources */}
        <div className="mb-5">
          <h4
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}
          >
            Data Sources
          </h4>
          <div className="space-y-1.5">
            {platforms.map((platform) => (
              <div
                key={platform.key}
                className="flex items-center justify-between px-3 py-2 rounded-xl transition-colors"
                style={{
                  backgroundColor: platform.connected
                    ? `${platform.color}08`
                    : 'var(--glass-surface-bg-subtle)',
                  border: platform.connected
                    ? `1px solid ${platform.color}20`
                    : '1px solid var(--glass-surface-border)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: platform.connected ? platform.color : 'var(--text-muted)' }}>
                    {platform.icon}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: platform.connected ? 'var(--foreground)' : 'var(--text-muted)' }}
                  >
                    {platform.name}
                  </span>
                </div>
                {platform.connected ? (
                  <div className="flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: platform.color }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Live</span>
                  </div>
                ) : (
                  <button
                    onClick={() => navigate('/get-started')}
                    className="text-xs px-2 py-0.5 rounded-full transition-colors"
                    style={{
                      color: 'var(--accent-vibrant)',
                      border: '1px solid var(--accent-vibrant)',
                      background: 'transparent',
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Active Context */}
        <div className="mb-5">
          <h4
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}
          >
            Active Context
          </h4>
          {isLoadingContext ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-vibrant)' }} />
            </div>
          ) : contextItems.length > 0 ? (
            <div className="space-y-1.5">
              {contextItems.filter(i => i.type !== 'platform').map((item, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 rounded-xl"
                  style={{
                    backgroundColor: 'var(--glass-surface-bg-subtle)',
                    border: '1px solid var(--glass-surface-border)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {item.type === 'memory' && <Clock className="w-3 h-3" style={{ color: 'var(--accent-vibrant)' }} />}
                    {item.type === 'fact' && <Lightbulb className="w-3 h-3" style={{ color: 'var(--accent-vibrant)' }} />}
                    {item.type === 'personality' && <Clay3DIcon name="brain" size={12} />}
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      {item.label}
                    </span>
                  </div>
                  <p className="text-sm leading-snug" style={{ color: 'var(--foreground)' }}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
              {connectedPlatforms.length > 0
                ? "Context loads when you chat"
                : "Connect platforms to build context"
              }
            </p>
          )}
        </div>

        {/* Twin Stats */}
        <div>
          <h4
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}
          >
            Twin Stats
          </h4>
          <div
            className="p-3 rounded-2xl"
            style={{
              backgroundColor: 'var(--glass-surface-bg-subtle)',
              border: '1px solid var(--glass-surface-border)',
            }}
          >
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div
                  className="text-lg font-semibold"
                  style={{ color: 'var(--accent-vibrant)', fontFamily: 'var(--font-heading)' }}
                >
                  {connectedCount || '--'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Platforms</div>
              </div>
              <div>
                <div
                  className="text-lg font-semibold"
                  style={{ color: 'var(--accent-vibrant)', fontFamily: 'var(--font-heading)' }}
                >
                  {messageCount}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Messages</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
