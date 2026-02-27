// src/components/onboarding/SoulRichnessBar.tsx
import React from 'react';
import { motion } from 'framer-motion';

const WEIGHTS: Record<string, number> = {
  spotify: 20, google_calendar: 15, youtube: 15,
  discord: 10, linkedin: 10, whoop: 15, oura: 15, github: 10, whatsapp: 5,
};

const label = (s: number) =>
  s < 20 ? 'Barely scratching the surface' :
  s < 40 ? 'Starting to see you' :
  s < 60 ? 'Getting interesting' :
  s < 80 ? 'Your soul is taking shape' : 'Deeply understood';

const SoulRichnessBar: React.FC<{ connectedPlatforms: string[] }> = ({ connectedPlatforms }) => {
  const score = Math.min(100, connectedPlatforms.reduce((s, p) => s + (WEIGHTS[p] ?? 5), 0));
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">Soul Richness</span>
        <span className="text-indigo-400 font-medium">{score}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
          initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      </div>
      <p className="text-xs text-gray-500">{label(score)}</p>
      {score >= 15 && score < 60 && (
        <p className="text-xs text-indigo-400">Connect more for a richer portrait — or reveal now.</p>
      )}
    </div>
  );
};

export default SoulRichnessBar;
