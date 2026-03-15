/**
 * Shared design tokens for Goal components.
 * Typography-driven dark design system.
 */
import {
  Moon,
  Dumbbell,
  Focus,
  CalendarClock,
  Scale,
} from 'lucide-react';

// Design tokens — glass surface design system
export const TEXT_PRIMARY = 'var(--foreground, #1b1818)';
export const TEXT_SECONDARY = 'var(--text-muted, #86807b)';
export const BORDER_COLOR = 'var(--card-separator, rgba(50,47,47,0.05))';

// Pill style
export const PILL_STYLE = {
  bg: 'var(--glass-surface-bg-subtle, rgba(218,217,215,0.2))',
  text: 'var(--text-secondary, #4a4242)',
  border: 'var(--glass-surface-border, #d9d1cb)',
} as const;

// Category label mapping
export const CATEGORY_LABELS: Record<string, string> = {
  sleep: 'Sleep',
  fitness: 'Fitness',
  focus: 'Focus',
  schedule: 'Schedule',
  balance: 'Balance',
};

// Category to icon mapping
export const CATEGORY_ICONS: Record<string, React.ElementType> = {
  sleep: Moon,
  fitness: Dumbbell,
  focus: Focus,
  schedule: CalendarClock,
  balance: Scale,
};
