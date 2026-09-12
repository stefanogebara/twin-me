/**
 * SidebarTabs — the switcher for identity's "Your twin" section
 * =============================================================
 * Three choices: Soul (default), Insights, Activity. In the register they
 * are 32px choices with a 4 corner: white with a hairline, and a pressed
 * choice is the field with an ink line.
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
  <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 16 }}>
    {TABS.map(({ id, icon: Icon, label }) => {
      const isActive = activeTab === id;
      return (
        <button
          key={id}
          type="button"
          onClick={() => onTabChange(id)}
          className="n-btn n-btn--ghost"
          style={isActive ? { background: 'var(--rg-field)', borderColor: 'var(--rg-ink)', fontWeight: 500 } : undefined}
          aria-pressed={isActive}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
          {label}
        </button>
      );
    })}
  </div>
);

export default SidebarTabs;
