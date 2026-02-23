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

interface Colors {
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  accent: string;
  bgSecondary: string;
  bgTertiary: string;
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
  colors: Colors;
}

const glassRowStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.18)',
  backdropFilter: 'blur(10px) saturate(140%)',
  WebkitBackdropFilter: 'blur(10px) saturate(140%)',
  border: '1px solid rgba(255, 255, 255, 0.45)',
} as React.CSSProperties;

export const ContextSidebar = ({
  showContext,
  onClose,
  platforms,
  connectedPlatforms,
  contextItems,
  isLoadingContext,
  connectedCount,
  messageCount,
  colors,
}: ContextSidebarProps) => {
  const navigate = useNavigate();

  return (
    <aside
      className={cn(
        "w-72 border-l hidden md:block overflow-y-auto",
        !showContext && "md:hidden"
      )}
      style={{
        backgroundColor: '#fcf6ef',
        borderColor: 'rgba(255, 255, 255, 0.45)',
      }}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3
            className="font-medium flex items-center gap-2"
            style={{ color: '#000000' }}
          >
            <img src="/images/backgrounds/flower-hero.png" alt="" className="w-4 h-4 object-contain" />
            Twin Context
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: '#8A857D' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-6">
          <h4
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: '#8A857D' }}
          >
            Data Sources
          </h4>
          <div className="space-y-2">
            {platforms.map((platform) => (
              <div
                key={platform.key}
                className="flex items-center justify-between p-2 rounded-xl"
                style={glassRowStyle}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: platform.connected ? platform.color : '#8A857D' }}>
                    {platform.icon}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: platform.connected ? '#000000' : '#8A857D' }}
                  >
                    {platform.name}
                  </span>
                </div>
                {platform.connected ? (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs" style={{ color: '#8A857D' }}>Live</span>
                  </div>
                ) : (
                  <button
                    onClick={() => navigate('/get-started')}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: '#000000', fontWeight: 500 }}
                  >
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h4
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: '#8A857D' }}
          >
            Active Context
          </h4>
          {isLoadingContext ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#8A857D' }} />
            </div>
          ) : contextItems.length > 0 ? (
            <div className="space-y-2">
              {contextItems.filter(i => i.type !== 'platform').map((item, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-xl"
                  style={glassRowStyle}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {item.type === 'memory' && <Clock className="w-3 h-3" style={{ color: '#000000' }} />}
                    {item.type === 'fact' && <Lightbulb className="w-3 h-3" style={{ color: '#F59E0B' }} />}
                    {item.type === 'personality' && <Clay3DIcon name="brain" size={12} />}
                    <span className="text-xs font-medium" style={{ color: '#8A857D' }}>
                      {item.label}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: '#000000' }}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: '#8A857D' }}>
              {connectedPlatforms.length > 0
                ? "Context loads when you chat"
                : "Connect platforms to build context"
              }
            </p>
          )}
        </div>

        <div>
          <h4
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: '#8A857D' }}
          >
            Twin Stats
          </h4>
          <div
            className="p-3 rounded-2xl"
            style={glassRowStyle}
          >
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-lg font-semibold" style={{ color: '#000000' }}>
                  {connectedCount || 0}
                </div>
                <div className="text-xs" style={{ color: '#8A857D' }}>Platforms</div>
              </div>
              <div>
                <div className="text-lg font-semibold" style={{ color: '#000000' }}>
                  {messageCount}
                </div>
                <div className="text-xs" style={{ color: '#8A857D' }}>Messages</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
