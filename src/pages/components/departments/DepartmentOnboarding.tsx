/**
 * DepartmentOnboarding
 *
 * Banner shown when no template has been applied (all departments at autonomy 0).
 * Offers quick-start templates as rich pills with preview text and cost estimate.
 */

import React from 'react';
import { Zap, HeartPulse, PenLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface DepartmentOnboardingProps {
  onSelectTemplate: (name: string) => void;
  visible: boolean;
}

interface QuickTemplate {
  id: string;
  label: string;
  preview: string;
  cost: string;
  Icon: LucideIcon;
  color: string;
}

const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: 'productivity',
    label: 'Productivity',
    preview: 'Emails + Calendar + Research',
    cost: '~$0.40/month API usage',
    Icon: Zap,
    color: '#3B82F6',
  },
  {
    id: 'health',
    label: 'Health',
    preview: 'Recovery + Sleep + Nudges',
    cost: '~$0.25/month API usage',
    Icon: HeartPulse,
    color: '#EF4444',
  },
  {
    id: 'creator',
    label: 'Creator',
    preview: 'Content + Social + Research',
    cost: '~$0.45/month API usage',
    Icon: PenLine,
    color: '#F59E0B',
  },
];

const DepartmentOnboarding: React.FC<DepartmentOnboardingProps> = ({ onSelectTemplate, visible }) => {
  if (!visible) return null;

  return (
    <div
      className="mb-8 px-6 py-5"
      style={{
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '20px',
        maxHeight: '200px',
      }}
    >
      <h2
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: '22px',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
          marginBottom: '4px',
        }}
      >
        Set up your AI team
      </h2>
      <p
        className="text-[13px] mb-4"
        style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
      >
        Pick a template to configure 3-4 departments in one click. Your twin starts watching your data and proposes actions for you to approve.
      </p>

      <div className="flex flex-wrap gap-2 mb-2">
        {QUICK_TEMPLATES.map(({ id, label, preview, cost, Icon, color }) => (
          <button
            key={id}
            onClick={() => onSelectTemplate(id)}
            className="flex items-center gap-2.5 transition-colors cursor-pointer text-left"
            style={{
              fontFamily: "'Inter', sans-serif",
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '8px 12px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
          >
            <div
              className="w-6 h-6 rounded-[8px] flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}1A` }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div className="flex flex-col leading-tight">
              <span
                className="text-[12px] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                {label}
              </span>
              <span
                className="text-[10px]"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                {preview}
              </span>
              <span
                className="text-[9px] mt-0.5"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                {cost}
              </span>
            </div>
          </button>
        ))}
      </div>

      <p
        className="text-[11px]"
        style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
      >
        Or pick departments individually below
      </p>
    </div>
  );
};

export default DepartmentOnboarding;
