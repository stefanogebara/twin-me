import { motion } from 'framer-motion';
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
      <motion.h2
        className="text-center mb-8"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 'clamp(2rem, 4vw, 2.5rem)',
          fontWeight: 400,
          color: 'var(--foreground)',
          opacity: 0.6,
          letterSpacing: '-0.02em',
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 0.6, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        {connectedPlatforms.length > 0
          ? "What's on your mind?"
          : "Let me get to know you first"
        }
      </motion.h2>

      {/* Subtitle */}
      {connectedPlatforms.length === 0 && (
        <motion.p
          className="text-center text-sm mb-8 max-w-sm"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Connect a platform and I'll start picking up on the things that make you you.
        </motion.p>
      )}

      {/* Suggestion pills — thin borders, no backgrounds */}
      {connectedPlatforms.length > 0 && (
        <motion.div
          className="flex flex-wrap items-center justify-center gap-2.5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {quickActions.map((action, idx) => (
            <motion.button
              key={idx}
              onClick={() => onQuickAction(action.label)}
              className="px-4 py-2 rounded-full text-[13px] transition-all"
              style={{
                color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'transparent',
                fontFamily: 'Inter, sans-serif',
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 + idx * 0.05 }}
              whileHover={{
                borderColor: 'rgba(16,183,127,0.3)',
                color: 'rgba(255,255,255,0.85)',
              }}
              whileTap={{ scale: 0.97 }}
            >
              {action.label}
            </motion.button>
          ))}
        </motion.div>
      )}

      {/* Connect CTA for no-platform users */}
      {connectedPlatforms.length === 0 && (
        <motion.button
          onClick={() => navigate('/get-started')}
          className="mt-4 px-5 py-2 rounded-full text-sm font-medium"
          style={{
            border: '1px solid #10b77f',
            color: '#10b77f',
            background: 'transparent',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          whileHover={{ backgroundColor: 'rgba(16,183,127,0.08)' }}
        >
          Connect platforms
        </motion.button>
      )}
    </div>
  );
};
