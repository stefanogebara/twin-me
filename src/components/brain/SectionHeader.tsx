import React from 'react';

export const SectionHeader: React.FC<{ title: string; icon?: React.ElementType }> = ({ title, icon: Icon }) => {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div
        className="w-1 h-5 rounded-full"
        style={{
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1))'
        }}
      />
      {Icon && <Icon className="w-4 h-4" style={{ color: '#8A857D' }} />}
      <h3
        className="text-sm uppercase tracking-wider"
        style={{ color: '#8A857D' }}
      >
        {title}
      </h3>
    </div>
  );
};
