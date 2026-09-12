import React from 'react';

/**
 * The app's ground. Formerly the Claura ambient-orb painter, then Nocturne's
 * flat obsidian; since the register (2026-09-12) the app sits on the warm page,
 * #fbfaf9. No photography, no orbs, no gradient: a flat colour, painted from
 * the token so this can never drift from the stylesheets. See
 * src/styles/register.css and /system.
 */
export const ClassicBackground: React.FC = () => (
  <div
    aria-hidden="true"
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      backgroundColor: 'var(--rg-page)',
    }}
  />
);
