import React from 'react';

export const ClassicBackground: React.FC = () => (
  <div
    aria-hidden="true"
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      backgroundColor: '#13121a',
      backgroundImage: [
        'radial-gradient(ellipse 60% 50% at 15% 15%, rgba(210,145,55,0.38) 0%, transparent 65%)',
        'radial-gradient(ellipse 50% 45% at 82% 12%, rgba(180,110,65,0.30) 0%, transparent 60%)',
        'radial-gradient(ellipse 55% 50% at 50% 90%, rgba(160,95,55,0.34) 0%, transparent 65%)',
        'radial-gradient(ellipse 45% 40% at 70% 55%, rgba(55,45,140,0.28) 0%, transparent 60%)',
      ].join(','),
      backgroundAttachment: 'fixed',
    }}
  />
);
