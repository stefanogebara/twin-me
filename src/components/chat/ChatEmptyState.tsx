import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';
import { cn } from '@/lib/utils';

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
  platforms,
  quickActions,
  onQuickAction,
  onSendMessage,
}: ChatEmptyStateProps) => {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col items-center justify-center px-4 py-12">
      {/* Glass card container */}
      <motion.div
        className="glass-card max-w-lg w-full flex flex-col items-center p-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Icon */}
        <motion.div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
          style={{
            background: 'var(--accent-vibrant-glow)',
            border: '1px solid var(--glass-surface-border)',
          }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >
          <Clay3DIcon name="brain" size={32} />
        </motion.div>

        {/* Heading — serif */}
        <motion.h2
          className="text-2xl md:text-3xl mb-2 text-center heading-serif"
          style={{
            fontWeight: 400,
            letterSpacing: '-0.03em',
            color: 'var(--foreground)',
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
        >
          {connectedPlatforms.length > 0
            ? "What's on your mind?"
            : "Let me get to know you first"
          }
        </motion.h2>

        <motion.p
          className="text-center mb-6 max-w-sm text-sm"
          style={{ color: 'var(--text-secondary)' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
        >
          {connectedPlatforms.length > 0
            ? "Ask me anything — patterns you've noticed, things you're curious about, or just how you're doing."
            : "Connect a platform and I'll start picking up on the things that make you you."
          }
        </motion.p>

        {/* Quick action chips with amber outlines */}
        {connectedPlatforms.length > 0 && (
          <div className="flex flex-col items-center gap-2.5 mb-6">
            {quickActions.map((action, idx) => (
              <motion.button
                key={idx}
                onClick={() => onQuickAction(action.label)}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  backdropFilter: 'blur(8px)',
                  border: '1.5px solid rgba(212,168,83,0.20)',
                  color: 'var(--foreground)',
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.3 + idx * 0.06, ease: [0.4, 0, 0.2, 1] }}
                whileHover={{
                  scale: 1.03,
                  y: -1,
                  backgroundColor: 'var(--accent-vibrant-glow)',
                }}
                whileTap={{ scale: 0.97 }}
              >
                <span style={{ color: 'var(--accent-vibrant)' }}>{action.icon}</span>
                {action.label}
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>

      {/* Platform badges below the card */}
      <motion.div
        className="flex flex-wrap items-center justify-center gap-2 max-w-lg mt-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        {platforms.map((platform) => (
          <div
            key={platform.key}
            onClick={() => !platform.connected && navigate('/get-started')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
              !platform.connected && "cursor-pointer hover:opacity-80"
            )}
            style={{
              backgroundColor: platform.connected
                ? `${platform.color}20`
                : 'var(--glass-surface-bg)',
              color: platform.connected ? platform.color : 'var(--text-muted)',
              border: platform.connected
                ? `1px solid ${platform.color}35`
                : '1px solid var(--glass-surface-border)'
            }}
          >
            {platform.icon}
            <span>{platform.name}</span>
            {platform.connected && <Check className="w-3 h-3" />}
          </div>
        ))}
      </motion.div>
    </div>
  );
};
