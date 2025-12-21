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
  const baseClasses = 'relative overflow-hidden rounded-2xl transition-all duration-300';

  const variantClasses = {
    card: 'glass-card',
    strong: 'glass-strong',
    subtle: 'glass-subtle',
    button: 'glass-button',
    'button-primary': 'glass-button-primary',
  };

  const hoverClasses = hover ? 'hover:scale-[1.02] hover:shadow-2xl cursor-pointer' : '';

  return (
    <div
      className={cn(baseClasses, variantClasses[variant], hoverClasses, className)}
      onClick={onClick}
    >
      {/* Background gradient blur effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-stone-400/8 to-stone-500/8 opacity-50 blur-xl" />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Animated gradient border effect on hover */}
      {hover && (
        <div className="absolute -inset-[1px] bg-gradient-to-r from-stone-400/20 to-stone-500/20 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-300 -z-10" />
      )}
    </div>
  );
};

// Feature card with glass effect
export const GlassFeatureCard: React.FC<{
  icon: ReactNode;
  title: string;
  description: string;
  gradient?: string;
  onClick?: () => void;
}> = ({ icon, title, description, gradient = 'from-indigo-500 to-purple-500', onClick }) => {
  return (
    <GlassBox variant="card" hover={true} onClick={onClick} className="p-6 group">
      {/* Icon container with stronger glass effect */}
      <div className="w-16 h-16 rounded-xl glass-strong flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-stone-900 mb-2">
        {title}
      </h3>

      {/* Description */}
      <p className="text-stone-700 text-sm leading-relaxed">
        {description}
      </p>

      {/* Bottom accent gradient */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300",
        gradient
      )} />
    </GlassBox>
  );
};

// Floating glass orb for decoration
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