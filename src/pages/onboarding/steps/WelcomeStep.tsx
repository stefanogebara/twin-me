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
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || 'you';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 24 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="text-center max-w-lg"
      >
        {/* Flower brand mark */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ delay: 0.1, duration: 0.7 }}
          className="mb-10 flex justify-center"
        >
          <img
            src="/images/backgrounds/flower-hero.png"
            alt="Twin Me"
            className="w-16 h-16 object-contain drop-shadow-md"
          />
        </motion.div>

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          style={{
            fontFamily: 'Halant, Georgia, serif',
            fontWeight: 400,
            letterSpacing: '-0.05em',
            lineHeight: 1.1,
            color: 'var(--foreground)',
            fontSize: 'clamp(48px, 8vw, 80px)',
            marginBottom: '20px',
          }}
        >
          Hey {firstName}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          style={{
            fontFamily: "'Geist', sans-serif",
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            lineHeight: 1.65,
            marginBottom: '48px',
          }}
        >
          Before your twin wakes up, we need to meet you.
          <br />
          A few minutes. Totally you.
        </motion.p>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ delay: 1.0, duration: 0.6 }}
          onClick={onBegin}
          style={{
            fontFamily: "'Geist', sans-serif",
            backgroundColor: 'var(--foreground)',
            color: 'var(--foreground)',
            borderRadius: '9999px',
            padding: '14px 28px',
            fontSize: '12px',
            fontWeight: 400,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            border: 'none',
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--foreground)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--foreground)')}
        >
          Begin →
        </motion.button>
      </motion.div>
    </div>
  );
};

export default WelcomeStep;
