import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Music, Heart, Calendar, Headphones, Moon, Activity, Clock, Users, Sun, Database } from 'lucide-react';
import type { PlatformDataPoint } from '@/services/enrichmentService';

const ICON_MAP: Record<string, React.ReactNode> = {
  music: <Music className="w-4 h-4" />,
  heart: <Heart className="w-4 h-4" />,
  calendar: <Calendar className="w-4 h-4" />,
  headphones: <Headphones className="w-4 h-4" />,
  moon: <Moon className="w-4 h-4" />,
  activity: <Activity className="w-4 h-4" />,
  clock: <Clock className="w-4 h-4" />,
  users: <Users className="w-4 h-4" />,
  sun: <Sun className="w-4 h-4" />,
  database: <Database className="w-4 h-4" />,
};

const PLATFORM_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  google_calendar: '#4285F4',
  whoop: '#00B388',
  youtube: '#FF0000',
  twitch: '#9146FF',
};

interface PlatformDataRevealProps {
  platform: string;
  platformName: string;
  insight: string;
  dataPoints: PlatformDataPoint[];
  twinReaction: string;
  onDismiss: () => void;
}

const PlatformDataReveal: React.FC<PlatformDataRevealProps> = ({
  platform,
  platformName,
  insight,
  dataPoints,
  twinReaction,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(true);
  const accentColor = PLATFORM_COLORS[platform] || '#E8D5B7';

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 400);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="rounded-2xl p-5 mb-4 relative overflow-hidden"
          style={{
            backgroundColor: 'rgba(232, 213, 183, 0.04)',
            border: `1px solid ${accentColor}33`,
          }}
        >
          {/* Accent gradient overlay */}
          <div
            className="absolute top-0 left-0 w-full h-1"
            style={{
              background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44)`,
            }}
          />

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1 rounded-full transition-opacity hover:opacity-70"
            style={{ color: 'rgba(232, 213, 183, 0.4)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Platform label */}
          <p
            className="text-xs uppercase tracking-widest mb-3"
            style={{
              color: accentColor,
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.15em',
            }}
          >
            {platformName} connected
          </p>

          {/* Insight headline */}
          <p
            className="text-sm mb-4 leading-relaxed"
            style={{
              color: 'rgba(232, 213, 183, 0.85)',
              fontFamily: 'var(--font-heading)',
            }}
          >
            {insight}
          </p>

          {/* Data points — slide in one by one */}
          {dataPoints.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {dataPoints.map((dp, i) => (
                <motion.div
                  key={dp.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.15, duration: 0.4 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{
                    backgroundColor: `${accentColor}15`,
                    border: `1px solid ${accentColor}25`,
                  }}
                >
                  <span style={{ color: accentColor }}>
                    {ICON_MAP[dp.icon] || ICON_MAP.database}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      color: 'rgba(232, 213, 183, 0.5)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {dp.label}
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: 'rgba(232, 213, 183, 0.85)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {dp.value}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* Twin reaction */}
          {twinReaction && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + dataPoints.length * 0.15 }}
              className="text-xs leading-relaxed"
              style={{
                color: 'rgba(232, 213, 183, 0.5)',
                fontFamily: 'var(--font-heading)',
                fontStyle: 'italic',
              }}
            >
              "{twinReaction}"
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PlatformDataReveal;
