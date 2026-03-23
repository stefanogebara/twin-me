import { Clock } from 'lucide-react';

interface ChatUsage {
  used: number;
  limit: number;
  remaining: number;
  tier: string;
}

interface LimitReachedBannerProps {
  chatUsage: ChatUsage | null;
}

export const LimitReachedBanner: React.FC<LimitReachedBannerProps> = ({ chatUsage }) => (
  <div className="flex justify-center px-6 py-6" role="alert">
    <div
      className="flex flex-col items-center text-center gap-3 px-8 py-6 max-w-sm w-full"
      style={{
        background: 'var(--glass-surface-bg)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid var(--glass-surface-border)',
        borderRadius: '20px',
        boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 var(--border-glass)',
      }}
    >
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full"
        style={{ background: 'var(--accent-vibrant-glow)' }}
      >
        <Clock className="w-5 h-5" style={{ color: 'var(--accent-vibrant)' }} />
      </div>

      <h3
        className="text-[20px] tracking-tight"
        style={{ fontFamily: "'Instrument Serif', serif", color: 'var(--foreground)' }}
      >
        You've reached this month's limit
      </h3>

      <p
        className="text-sm leading-relaxed"
        style={{ fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)' }}
      >
        Upgrade your plan for more conversations with your twin.
      </p>

      {chatUsage && (
        <span
          className="text-xs px-3 py-1.5 rounded-[46px] mt-1"
          style={{
            border: '1px solid var(--glass-surface-border)',
            color: 'var(--text-muted)',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {chatUsage.used}/{chatUsage.limit} messages used
        </span>
      )}
    </div>
  </div>
);
