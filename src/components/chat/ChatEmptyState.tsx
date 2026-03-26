import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

function getGreeting(firstName: string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Good Morning, ${firstName}`;
  if (hour >= 12 && hour < 18) return `Good Afternoon, ${firstName}`;
  if (hour >= 18 && hour < 22) return `Good Evening, ${firstName}`;
  return `Good Night, ${firstName}`;
}

function formatCurrentDate(): string {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  const day = now.getDate();

  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';

  return `${dayName}, ${month} ${day}${suffix}`;
}

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
  const { user } = useAuth();
  const firstName = user?.firstName || 'there';
  const greeting = getGreeting(firstName);
  const dateStr = formatCurrentDate();

  return (
    <div className="h-full flex flex-col items-center justify-center px-6">
      {/* Date line */}
      <span
        className="text-center mb-2"
        style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.4)',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {dateStr}
      </span>

      {/* Time-aware greeting */}
      <h2
        className="text-center mb-8"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '32px',
          fontWeight: 300,
          color: '#F5F5F4',
          letterSpacing: '-0.02em',
        }}
      >
        {connectedPlatforms.length > 0
          ? greeting
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

      {/* Agentic awareness hint */}
      {connectedPlatforms.length > 0 && (
        <p
          className="text-center text-[11px] mb-6 max-w-xs"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          I can set reminders, draft emails in your voice, suggest music, and more. Just ask.
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
