/**
 * Animated Counter Component
 *
 * Displays numbers with a count-up animation when data loads.
 * Uses requestAnimationFrame for smooth animation.
 */

import React, { useEffect, useState, useRef } from 'react';
import { respectReducedMotion } from '@/lib/animations';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

/**
 * Easing function for smooth count-up
 */
const easeOutCubic = (t: number): number => {
  return 1 - Math.pow(1 - t, 3);
};

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 1000,
  className = '',
  prefix = '',
  suffix = '',
  decimals = 0
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const previousValueRef = useRef(0);

  useEffect(() => {
    // If reduced motion is preferred, skip animation
    if (respectReducedMotion()) {
      setDisplayValue(value);
      return;
    }

    const startValue = previousValueRef.current;
    const endValue = value;
    const diff = endValue - startValue;

    // If no change, skip animation
    if (diff === 0) return;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      const currentValue = startValue + diff * easedProgress;
      setDisplayValue(currentValue);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        previousValueRef.current = endValue;
        startTimeRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [value, duration]);

  // Format the display value
  const formattedValue = decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue).toLocaleString();

  return (
    <span className={className}>
      {prefix}{formattedValue}{suffix}
    </span>
  );
};

/**
 * Animated percentage counter with progress bar
 */
interface AnimatedPercentageProps {
  value: number;
  duration?: number;
  className?: string;
  barColor?: string;
  barHeight?: number;
  showLabel?: boolean;
}

export const AnimatedPercentage: React.FC<AnimatedPercentageProps> = ({
  value,
  duration = 1000,
  className = '',
  barColor = '#C1C0B6',
  barHeight = 4,
  showLabel = true
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (respectReducedMotion()) {
      setDisplayValue(value);
      return;
    }

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      setDisplayValue(value * easedProgress);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        startTimeRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [value, duration]);

  return (
    <div className={className}>
      {showLabel && (
        <span className="text-sm font-medium">
          {Math.round(displayValue)}%
        </span>
      )}
      <div
        className="w-full rounded-full overflow-hidden mt-1"
        style={{
          height: barHeight,
          backgroundColor: `${barColor}20`
        }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${displayValue}%`,
            backgroundColor: barColor,
            transitionDuration: respectReducedMotion() ? '0ms' : '100ms'
          }}
        />
      </div>
    </div>
  );
};

export default AnimatedCounter;
