/**
 * SectionLabel — Small uppercase section header for onboarding categories.
 */

import React from 'react';

interface SectionLabelProps {
  label: string;
}

export const SectionLabel: React.FC<SectionLabelProps> = ({ label }) => (
  <span
    className="text-[12px] font-medium tracking-[0.08em] uppercase block mb-4"
    style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
  >
    {label}
  </span>
);

export const Divider: React.FC = () => (
  <div className="my-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
);
