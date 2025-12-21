import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface LiquidGlassBoxProps {
  children: ReactNode;
  className?: string;
  variant?: 'subtle' | 'vibrant' | 'mirror';
  size?: 'sm' | 'md' | 'lg';
}

export const LiquidGlassBox = ({ 
  children, 
  className, 
  variant = 'subtle',
  size = 'md' 
}: LiquidGlassBoxProps) => {
  const sizeClasses = {
    sm: 'w-32 h-20 rounded-2xl',
    md: 'w-48 h-32 rounded-3xl',
    lg: 'w-64 h-40 rounded-3xl'
  };

  const variantClasses = {
    subtle: 'liquid-glass',
    vibrant: 'liquid-glass bg-gradient-to-br from-accent/20 via-primary/10 to-secondary/20',
    mirror: 'liquid-glass mirror-box'
  };

  return (
    <div className={cn(
      'mirror-3d',
      className
    )}>
      <div className={cn(
        sizeClasses[size],
        variantClasses[variant],
        'flex items-center justify-center relative group'
      )}>
        <div className="relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
};