/**
 * DemoValueModal — Dimension.dev-style modal showing sample insights
 * for a platform when clicked in demo mode.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatPlatformName, getDemoInsights } from './onboardingHelpers';

interface DemoValueModalProps {
  platform: string | null;
  onClose: () => void;
  onSignUp: () => void;
}

export const DemoValueModal: React.FC<DemoValueModalProps> = ({
  platform,
  onClose,
  onSignUp,
}) => (
  <AnimatePresence>
    {platform && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        onClick={onClose}
      >
        <motion.div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
        <motion.div
          className="relative max-w-md w-full rounded-[24px] overflow-hidden"
          style={{
            background: '#1a1820',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.6)',
          }}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Accent bar */}
          <div
            className="h-[2px] w-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }}
          />

          <div className="px-6 py-6">
            <h3
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontSize: '22px',
                color: '#F5F5F4',
                letterSpacing: '-0.02em',
              }}
            >
              What you'd discover with {formatPlatformName(platform)}
            </h3>
            <p className="text-xs mt-1 mb-5" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
              Sample insights from real user data
            </p>

            <div className="space-y-3 mb-6">
              {getDemoInsights(platform).map((insight, i) => (
                <motion.div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 rounded-[16px]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.12, duration: 0.4, ease: 'easeOut' }}
                >
                  <span className="text-base mt-0.5 flex-shrink-0">{insight.emoji}</span>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif" }}>
                    {insight.text}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="flex gap-3">
              <motion.button
                onClick={onSignUp}
                className="flex-1 py-3 rounded-[100px] text-sm font-medium"
                style={{ background: '#F5F5F4', color: '#110f0f', fontFamily: "'Inter', sans-serif" }}
                whileHover={{ scale: 1.02, opacity: 0.9 }}
                whileTap={{ scale: 0.98 }}
              >
                Sign up to see your real data
              </motion.button>
              <button
                onClick={onClose}
                className="px-4 py-3 rounded-[100px] text-sm"
                style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: "'Inter', sans-serif" }}
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
