import { Link } from 'react-router-dom';
import { PLATFORM_DISPLAY_NAMES } from '@/lib/platformNames';

interface PlatformsListProps {
  platforms: Array<{
    name: string;
    provider: string;
    lastSync: string | null;
    status: 'active' | 'stale' | 'disconnected';
  }>;
}

const LABEL_STYLE = 'text-[11px] uppercase tracking-[0.15em] font-medium mb-4';

function dotColor(status: string, lastSync: string | null): string {
  if (status === 'active' && lastSync) {
    const hours = (Date.now() - new Date(lastSync).getTime()) / 3600000;
    return hours < 2 ? '#10B981' : '#F59E0B';
  }
  return '#333';
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PlatformsList({ platforms }: PlatformsListProps) {
  if (platforms.length === 0) {
    return (
      <section className="mb-12">
        <h2 className={LABEL_STYLE} style={{ color: 'var(--text-muted)' }}>PLATFORMS</h2>
        <Link
          to="/get-started"
          className="text-sm transition-colors duration-150 hover:brightness-150"
          style={{ color: 'var(--text-secondary)' }}
        >
          Connect a platform to get started &rarr;
        </Link>
      </section>
    );
  }

  return (
    <section className="mb-10 pb-10" style={{ borderBottom: '1px solid var(--glass-surface-border)' }}>
      <p className={LABEL_STYLE} style={{ color: 'var(--text-muted)' }}>PLATFORMS</p>
      <div>
        {platforms.map((p, i) => (
          <div
            key={p.provider}
            className="flex items-center justify-between py-3"
            style={{
              borderBottom: i < platforms.length - 1 ? '1px solid var(--border)' : undefined,
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: dotColor(p.status, p.lastSync),
                  flexShrink: 0,
                }}
              />
              <span className="text-[14px]" style={{ color: 'var(--foreground)' }}>
                {PLATFORM_DISPLAY_NAMES[p.provider] ?? p.name}
              </span>
            </div>
            <span className="text-[13px] ml-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
              {relativeTime(p.lastSync)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
