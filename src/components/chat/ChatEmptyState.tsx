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

interface Colors {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  accent: string;
}

interface ChatEmptyStateProps {
  connectedPlatforms: Platform[];
  platforms: Platform[];
  quickActions: QuickAction[];
  colors: Colors;
  onQuickAction: (text: string) => void;
}

// Glass button style matching the design system
const glassButtonStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.18)',
  backdropFilter: 'blur(10px) saturate(140%)',
  WebkitBackdropFilter: 'blur(10px) saturate(140%)',
  border: '1px solid rgba(255, 255, 255, 0.45)',
  color: '#000000',
} as React.CSSProperties;

export const ChatEmptyState = ({
  connectedPlatforms,
  platforms,
  quickActions,
  colors,
  onQuickAction,
}: ChatEmptyStateProps) => {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col items-center justify-center px-4 py-12">
      <motion.div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-8"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.18)', border: '1px solid rgba(255, 255, 255, 0.45)' }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <Clay3DIcon name="brain" size={40} />
      </motion.div>

      <motion.h1
        className="text-2xl md:text-3xl font-medium mb-3 text-center heading-serif"
        style={{ color: '#000000' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
      >
        {connectedPlatforms.length > 0
          ? "What do you want to know?"
          : "Connect platforms to unlock your Twin"
        }
      </motion.h1>

      <motion.p
        className="text-center mb-8 max-w-md"
        style={{ color: '#8A857D' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        {connectedPlatforms.length > 0
          ? "Ask me anything about yourself — I know your Spotify, Calendar, and more. Try: \"What have you noticed about me this week?\""
          : "Your twin learns from your platforms — music, calendar, social, and more — to understand your soul signature."
        }
      </motion.p>

      {connectedPlatforms.length > 0 && (
        <div className="flex flex-wrap gap-5 justify-center max-w-lg mb-8">
          {quickActions.map((action, idx) => (
            <motion.button
              key={idx}
              onClick={() => onQuickAction(action.label)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-all"
              style={glassButtonStyle}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.35 + idx * 0.08, ease: [0.4, 0, 0.2, 1] }}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              <span style={{ color: '#000000' }}>{action.icon}</span>
              {action.label}
            </motion.button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
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
                ? `${platform.color}15`
                : 'rgba(255, 255, 255, 0.18)',
              color: platform.connected ? platform.color : '#8A857D',
              border: platform.connected
                ? `1px solid ${platform.color}30`
                : '1px solid rgba(255, 255, 255, 0.45)'
            }}
          >
            {platform.icon}
            <span>{platform.name}</span>
            {platform.connected && <Check className="w-3 h-3" />}
          </div>
        ))}
      </div>
    </div>
  );
};
