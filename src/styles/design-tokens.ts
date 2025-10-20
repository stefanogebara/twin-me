/**
 * Design Tokens
 * Centralized design values for consistent UI across the platform
 * Based on the Anthropic-inspired design system
 */

export const colors = {
  // Primary Brand Colors
  primary: {
    orange: '#D97706',        // Claude accent orange
    orangeHover: '#B45309',   // Darker orange for hover states
    ivory: '#FAF9F5',         // Main background
    white: '#FFFFFF',         // Surface/cards
  },

  // Text Colors
  text: {
    primary: '#141413',       // Deep slate - primary text
    secondary: '#595959',     // Medium slate - secondary text
    muted: '#8C8C8C',        // Light slate - muted text
    inverse: '#FFFFFF',       // White text on dark backgrounds
  },

  // Semantic Colors
  semantic: {
    success: '#10B981',       // Green for success states
    error: '#EF4444',         // Red for errors
    warning: '#F59E0B',       // Amber for warnings
    info: '#3B82F6',          // Blue for information
  },

  // Border Colors
  border: {
    default: 'rgba(20, 20, 19, 0.1)',  // Subtle slate border
    strong: 'rgba(20, 20, 19, 0.2)',   // Stronger border
    accent: '#D97706',                  // Orange accent border
  },

  // Background Colors
  background: {
    primary: '#FAF9F5',       // Main page background
    surface: '#FFFFFF',       // Card/surface background
    raised: '#F9FAFB',        // Slightly elevated surface
    overlay: 'rgba(0, 0, 0, 0.5)',  // Modal overlay
  }
};

export const typography = {
  // Font Families (matching the custom CSS properties)
  fonts: {
    heading: "'Space Grotesk', system-ui, -apple-system, sans-serif",
    body: "'Source Serif 4', Georgia, serif",
    ui: "'DM Sans', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Courier New', monospace",
  },

  // Font Sizes
  sizes: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem',    // 48px
  },

  // Font Weights
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line Heights
  lineHeights: {
    tight: 1.1,
    snug: 1.25,
    normal: 1.5,
    relaxed: 1.6,
    loose: 1.75,
  },

  // Letter Spacing
  letterSpacing: {
    tighter: '-0.02em',
    tight: '-0.01em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
  }
};

export const spacing = {
  // Base 8px grid system
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
  36: '9rem',       // 144px
  40: '10rem',      // 160px
};

export const radii = {
  none: '0',
  sm: '0.125rem',   // 2px
  default: '0.25rem', // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',   // Pills/circles
};

export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  default: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
};

export const transitions = {
  // Durations
  durations: {
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  // Easings
  easings: {
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // Common transitions
  common: {
    all: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    colors: 'background-color 200ms, border-color 200ms, color 200ms',
    opacity: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    shadow: 'box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  }
};

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

export const zIndex = {
  hide: -1,
  auto: 'auto',
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  skipLink: 1600,
  toast: 1700,
  tooltip: 1800,
};

// Export all tokens as a single object for easy access
export const designTokens = {
  colors,
  typography,
  spacing,
  radii,
  shadows,
  transitions,
  breakpoints,
  zIndex,
};

export default designTokens;