/**
 * DepartmentOnboarding
 *
 * Banner shown when no template has been applied (all departments at autonomy 0).
 * Offers quick-start templates as pills with a manual-customize fallback.
 */

import React from 'react';

interface DepartmentOnboardingProps {
  onSelectTemplate: (name: string) => void;
  visible: boolean;
}

const QUICK_TEMPLATES = [
  { id: 'productivity', label: 'Productivity' },
  { id: 'health', label: 'Health' },
  { id: 'creator', label: 'Creator' },
] as const;

const DepartmentOnboarding: React.FC<DepartmentOnboardingProps> = ({ onSelectTemplate, visible }) => {
  if (!visible) return null;

  return (
    <div
      className="mb-8 px-6 py-6"
      style={{
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '20px',
      }}
    >
      <h2
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: '22px',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
          marginBottom: '6px',
        }}
      >
        Set up your AI team
      </h2>
      <p
        className="text-sm mb-5"
        style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
      >
        Choose a template to configure your departments, or customize each one individually
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {QUICK_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectTemplate(t.id)}
            className="text-[13px] font-medium transition-colors cursor-pointer"
            style={{
              fontFamily: "'Inter', sans-serif",
              background: 'rgba(255,255,255,0.08)',
              color: 'var(--foreground)',
              border: 'none',
              borderRadius: '100px',
              padding: '6px 16px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p
        className="text-[12px]"
        style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
      >
        Or customize manually below
      </p>
    </div>
  );
};

export default DepartmentOnboarding;
