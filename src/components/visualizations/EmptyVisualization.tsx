/**
 * Empty Visualization
 * Beautiful empty state when no data exists for visualization
 */

import { ReactNode } from 'react';

interface EmptyVisualizationProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyVisualization({
  icon,
  title,
  description,
  action,
  className = ''
}: EmptyVisualizationProps) {
  return (
    <div
      className={`rounded-lg p-12 ${className}`}
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="max-w-md mx-auto text-center">
        {/* Icon */}
        {icon && (
          <div className="w-20 h-20 bg-white/8 rounded-full flex items-center justify-center mx-auto mb-6">
            <div className="text-muted-foreground">
              {icon}
            </div>
          </div>
        )}

        {/* Title */}
        <h3 className="text-xl font-semibold text-foreground mb-3" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {description}
        </p>

        {/* Action */}
        {action && (
          <div>
            {action}
          </div>
        )}

        {/* Decorative dots */}
        <div className="flex justify-center space-x-2 mt-8">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="w-2 h-2 bg-white/30 rounded-full animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
