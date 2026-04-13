/**
 * StatusHero -- OpenAI-inspired greeting + action summary
 * "Good morning, [name]. X actions, Y pending, Z handled."
 */

import React from 'react';
import { motion } from 'framer-motion';

interface StatusHeroProps {
  firstName: string;
  actionsThisWeek: number;
  pendingCount: number;
  handledAutonomously: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const StatusHero: React.FC<StatusHeroProps> = ({
  firstName,
  actionsThisWeek,
  pendingCount,
  handledAutonomously,
}) => {
  const greeting = getGreeting();
  const name = firstName || 'there';

  const parts: string[] = [];
  if (actionsThisWeek > 0) parts.push(`${actionsThisWeek} action${actionsThisWeek !== 1 ? 's' : ''} this week`);
  if (pendingCount > 0) parts.push(`${pendingCount} pending`);
  if (handledAutonomously > 0) parts.push(`${handledAutonomously} handled automatically`);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <h1
        className="text-[28px] font-normal tracking-tight mb-1"
        style={{ color: 'var(--text-primary)', fontFamily: "'Instrument Serif', serif", fontStyle: 'italic' }}
      >
        {greeting}, {name}.
      </h1>
      {parts.length > 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {parts.join(' \u00b7 ')}
        </p>
      ) : (
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Your AI departments are standing by.
        </p>
      )}
    </motion.div>
  );
};

export default StatusHero;
