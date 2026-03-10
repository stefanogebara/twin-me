import React from 'react';

interface SundustEmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const SundustEmptyState: React.FC<SundustEmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="sd-empty-state">
    {icon && <div style={{ fontSize: 36, marginBottom: 4 }}>{icon}</div>}
    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--sd-text-secondary)' }}>{title}</div>
    {description && <div style={{ fontSize: 13, color: 'var(--sd-text-muted)', maxWidth: 320, lineHeight: 1.6 }}>{description}</div>}
    {action}
  </div>
);
