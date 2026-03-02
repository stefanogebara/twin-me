import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../../contexts/AuthContext';

interface WelcomeStepProps {
  onBegin: () => void;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ onBegin }) => {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Brief delay before animating in
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || 'you';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a09] text-white px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 24 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="text-center max-w-lg"
      >
        {/* Brand mark */}
        <div className="mb-10 flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
            <span className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
              T
            </span>
          </div>
        </div>

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-tight"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Hey {firstName}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="text-lg text-white/60 mb-12 leading-relaxed"
        >
          Before your twin wakes up, we need to meet you.
          <br />
          <span className="text-white/40 text-base">12–18 questions. Totally you.</span>
        </motion.p>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ delay: 1.0, duration: 0.6 }}
          onClick={onBegin}
          className="px-8 py-4 bg-white text-[#0a0a09] rounded-2xl font-semibold text-base hover:bg-white/90 transition-colors"
        >
          Begin →
        </motion.button>
      </motion.div>
    </div>
  );
};

export default WelcomeStep;
