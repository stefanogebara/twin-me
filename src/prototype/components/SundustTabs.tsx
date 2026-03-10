import React from 'react';

interface Tab {
  key: string;
  label: string;
}

interface SundustTabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export const SundustTabs: React.FC<SundustTabsProps> = ({ tabs, active, onChange, className = '' }) => (
  <div className={`sd-tabs ${className}`}>
    {tabs.map((tab) => (
      <button
        key={tab.key}
        className={`sd-tab ${active === tab.key ? 'active' : ''}`}
        onClick={() => onChange(tab.key)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
