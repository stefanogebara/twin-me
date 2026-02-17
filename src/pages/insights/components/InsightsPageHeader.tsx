import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw } from 'lucide-react';

interface InsightsPageHeaderProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBgColor: string;
  textColor: string;
  textSecondaryColor: string;
  onBack: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const InsightsPageHeader: React.FC<InsightsPageHeaderProps> = ({
  title,
  subtitle,
  icon,
  iconColor,
  iconBgColor,
  textColor,
  textSecondaryColor,
  onBack,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <motion.button
          onClick={onBack}
          className="p-2 rounded-lg glass-button"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </motion.button>

        <motion.div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: iconBgColor }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >
          {icon}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
        >
          <h1
            className="text-2xl"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 500,
              color: textColor,
            }}
          >
            {title}
          </h1>
          <p className="text-sm" style={{ color: textSecondaryColor }}>
            {subtitle}
          </p>
        </motion.div>
      </div>

      <motion.button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="p-2 rounded-lg glass-button"
        title="Get a fresh observation"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
        whileHover={{ scale: 1.1, rotate: 90 }}
        whileTap={{ scale: 0.9 }}
      >
        <RefreshCw
          className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
          style={{ color: textColor }}
        />
      </motion.button>
    </div>
  );
};
