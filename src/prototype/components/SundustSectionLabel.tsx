import React from 'react';

interface SundustSectionLabelProps {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const SundustSectionLabel: React.FC<SundustSectionLabelProps> = ({ children, action, className = '' }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }} className={className}>
    <span className="sd-section-label">{children}</span>
    {action}
  </div>
);
