/**
 * SidebarTabs — Icon tab switcher for context sidebar
 * ====================================================
 * Three tabs: Soul (default), Insights, Activity.
 * Dimension.dev-style icon pills with active state.
 */

import React from 'react';
import { Fingerprint, Sparkles, Activity } from 'lucide-react';

export type SidebarTab = 'soul' | 'insights' | 'activity';

interface SidebarTabsProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

const TABS: { id: SidebarTab; icon: React.ElementType; label: string }[] = [
  { id: 'soul', icon: Fingerprint, label: 'Soul' },
  { id: 'insights', icon: Sparkles, label: 'Insights' },
  { id: 'activity', icon: Activity, label: 'Activity' },
];

const SidebarTabs: React.FC<SidebarTabsProps> = ({ activeTab, onTabChange }) => (
  <div
    className="flex items-center gap-1 p-1 rounded-full mx-auto w-fit"
    style={{
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.10)',
    }}
  >
    {TABS.map(({ id, icon: Icon, label }) => {
      const isActive = activeTab === id;
      return (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
          style={{
            background: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
            color: isActive ? 'var(--foreground)' : 'rgba(255,255,255,0.35)',
          }}
          aria-label={label}
          aria-pressed={isActive}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      );
    })}
  </div>
);

export default SidebarTabs;
