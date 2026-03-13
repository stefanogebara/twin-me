import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GlassBoxProps {
  children: ReactNode;
  className?: string;
  variant?: 'card' | 'strong' | 'subtle' | 'button' | 'button-primary';
  hover?: boolean;
  onClick?: () => void;
}

export const GlassBox: React.FC<GlassBoxProps> = ({
  children,
  className = '',
  variant = 'card',
  hover = false,
  onClick,
}) => {
  const baseClasses = 'relative overflow-hidden rounded-lg transition-all duration-300';

  const variantStyles: Record<string, React.CSSProperties> = {
    card: { border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' },
    strong: { border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)' },
    subtle: { border: '1px solid rgba(255,255,255,0.04)', backgroundColor: 'rgba(255,255,255,0.01)' },
    button: { border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' },
    'button-primary': { backgroundColor: '#10b77f', color: '#0a0f0a' },
  };

  const hoverClasses = hover ? 'hover:scale-[1.02] cursor-pointer' : '';

  return (
    <div
      className={cn(baseClasses, hoverClasses, className)}
      style={variantStyles[variant]}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

// Feature card with flat dark style
export const GlassFeatureCard: React.FC<{
  icon: ReactNode;
  title: string;
  description: string;
  gradient?: string;
  onClick?: () => void;
}> = ({ icon, title, description, onClick }) => {
  return (
    <GlassBox variant="card" hover={true} onClick={onClick} className="p-6 group">
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300"
        style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)' }}
      >
        {icon}
      </div>

      <h3 className="text-xl font-semibold text-foreground mb-2">
        {title}
      </h3>

      <p style={{ color: 'rgba(255,255,255,0.4)' }} className="text-sm leading-relaxed">
        {description}
      </p>
    </GlassBox>
  );
};

// Floating orb for decoration
export const GlassOrb: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  gradient?: string;
}> = ({ size = 'md', className = '', gradient = 'from-indigo-500/30 to-purple-500/30' }) => {
  const sizeClasses = {
    sm: 'w-24 h-24',
    md: 'w-48 h-48',
    lg: 'w-96 h-96',
  };

  return (
    <div className={cn(
      "absolute rounded-full blur-3xl animate-pulse",
      sizeClasses[size],
      className
    )}>
      <div className={cn(
        "w-full h-full rounded-full bg-gradient-to-br",
        gradient
      )} />
    </div>
  );
};

export default GlassBox;
