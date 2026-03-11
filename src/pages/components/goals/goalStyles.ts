/**
 * Shared design tokens for Goal components.
 * Extracted from GoalCard + GoalSuggestionCard to avoid duplication.
 */
import {
  Moon,
  Dumbbell,
  Focus,
  CalendarClock,
  Scale,
} from 'lucide-react';

// Design tokens
export const TEXT_PRIMARY = 'var(--foreground)';
export const TEXT_SECONDARY = 'var(--text-secondary)';
export const BORDER_COLOR = 'var(--glass-surface-border)';

// Glass surface pill style (design system compliant)
export const PILL_STYLE = {
  bg: 'rgba(255,255,255,0.06)',
  text: 'var(--text-secondary)',
  border: 'var(--glass-surface-border)',
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
