import React from 'react';

/**
 * The Nocturne canvas. Formerly the Claura ambient-orb painter; since the
 * Nocturne flip (2026-09-01) the app floats on flat obsidian — Law 1 of the
 * system: depth is a surface step, never a glow. No photography, no orbs,
 * no gradients. See src/styles/nocturne.css and /nocturne/system.
 */
export const ClassicBackground: React.FC = () => (
  <div
    aria-hidden="true"
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      backgroundColor: '#0f1011',
    }}
  />
);
