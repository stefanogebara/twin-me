import { useNavigate } from 'react-router-dom';

interface Platform {
  name: string;
  icon: React.ReactNode;
  key: string;
  color: string;
  connected: boolean | undefined;
}

interface QuickAction {
  label: string;
  icon: React.ReactNode;
}

interface ChatEmptyStateProps {
  connectedPlatforms: Platform[];
  platforms: Platform[];
  quickActions: QuickAction[];
  onQuickAction: (text: string) => void;
  onSendMessage?: () => void;
}

export const ChatEmptyState = ({
  connectedPlatforms,
  quickActions,
  onQuickAction,
}: ChatEmptyStateProps) => {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col items-center justify-center px-6">
      {/* Large serif heading — no card, no icon */}
      <h2
        className="text-center mb-8"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 'clamp(2rem, 4vw, 2.5rem)',
          fontWeight: 400,
          color: 'var(--foreground)',
          opacity: 0.85,
          letterSpacing: '-0.02em',
        }}
      >
        {connectedPlatforms.length > 0
          ? "What's on your mind?"
          : "Let me get to know you first"
        }
      </h2>

      {/* Subtitle */}
      {connectedPlatforms.length === 0 && (
        <p
          className="text-center text-sm mb-8 max-w-sm"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          Connect a platform and I'll start picking up on the things that make you you.
        </p>
      )}

      {/* Suggestion pills — thin borders, no backgrounds */}
      {connectedPlatforms.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => onQuickAction(action.label)}
              className="px-3 py-2.5 rounded-[46px] text-[12px] font-medium transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.97]"
              style={{
                color: 'rgba(255,255,255,0.6)',
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid var(--glass-surface-border)',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Connect CTA for no-platform users */}
      {connectedPlatforms.length === 0 && (
        <button
          onClick={() => navigate('/get-started')}
          className="mt-4 px-5 py-2 rounded-[100px] text-sm font-medium hover:bg-[rgba(16,183,127,0.08)] transition-all duration-150 ease-out active:scale-[0.97]"
          style={{
            border: '1px solid #10b77f',
            color: '#10b77f',
            background: 'transparent',
          }}
        >
          Connect platforms
        </button>
      )}
    </div>
  );
};
