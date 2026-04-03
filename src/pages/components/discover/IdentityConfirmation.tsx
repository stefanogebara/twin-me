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
        style={{ color: 'rgba(255,255,255,0.50)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        Is this you?
      </p>
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          className="px-5 py-2 rounded-full text-[13px] font-medium transition-all duration-150 hover:opacity-90"
          style={{
            backgroundColor: '#F5F5F4',
            color: '#110f0f',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          Yes, that's me
        </button>
        <button
          onClick={onReject}
          className="px-5 py-2 rounded-full text-[13px] font-medium transition-all duration-150 hover:bg-[rgba(255,255,255,0.08)]"
          style={{
            backgroundColor: 'transparent',
            color: 'rgba(255,255,255,0.60)',
            border: '1px solid rgba(255,255,255,0.12)',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          Not me
        </button>
      </div>
    </motion.div>
  );
};
