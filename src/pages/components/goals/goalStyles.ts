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

// Design tokens — typography-driven dark theme
export const TEXT_PRIMARY = 'var(--foreground)';
export const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
export const BORDER_COLOR = 'rgba(255,255,255,0.06)';

// Pill style
export const PILL_STYLE = {
  bg: 'rgba(255,255,255,0.04)',
  text: 'rgba(255,255,255,0.5)',
  border: 'rgba(255,255,255,0.08)',
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
