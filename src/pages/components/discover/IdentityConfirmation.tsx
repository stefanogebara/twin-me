/**
 * IdentityConfirmation — "Is this you?" after discovery scan
 * Cofounder.co-style: Yes/No pill buttons, fade-in after delay
 */
import React from 'react';
import { motion } from 'framer-motion';

interface IdentityConfirmationProps {
  onConfirm: () => void;
  onReject: () => void;
}

export const IdentityConfirmation: React.FC<IdentityConfirmationProps> = ({ onConfirm, onReject }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.3 }}
      className="flex flex-col items-center gap-3 mt-6"
    >
      <p
        className="text-[14px]"
        style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        Is this you?
      </p>
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          className="px-5 py-2 rounded-full text-[13px] font-medium transition-all duration-150 hover:opacity-90"
          style={{
            backgroundColor: 'var(--claura-bone)',
            color: 'var(--claura-bone-ink)',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          Yes, that's me
        </button>
        <button
          onClick={onReject}
          className="px-5 py-2 rounded-full text-[13px] font-medium transition-all duration-150 hover:bg-[var(--surface)]"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--glass-surface-border)',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          Not me
        </button>
      </div>
    </motion.div>
  );
};
