import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Claura port Phase 1 (plan: .claude/plans/2026-07-16-claura-port/README.md):
// the theme machinery is unlocked ('light' | 'dark' | 'system'), persisted, and
// applied to <html> — but the DEFAULT stays 'dark' and no app UI exposes
// setTheme yet. The app's own tokens only render dark until the Phase 2 token
// merge lands; flipping the default (or honoring 'system' out of the box)
// before then would show a half-themed UI. The /preview design prototypes
// share the same storage key, so a choice made there carries into the app.

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'claura-theme';

/** Sanitize anything read from storage into a valid Theme (default: dark). */
export function normalizeTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark';
}

/** Resolve the user's choice against the OS preference. */
export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyToRoot(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.setAttribute('data-theme', resolved);
}

export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored === null ? defaultTheme : normalizeTheme(stored);
    } catch {
      return defaultTheme; // storage unavailable (private mode) — fall back silently
    }
  });
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  const resolvedTheme = resolveTheme(theme, prefersDark);

  // Track OS preference so theme='system' stays live.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    applyToRoot(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    const normalized = normalizeTheme(next);
    setThemeState(normalized);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // storage unavailable — the in-memory choice still applies this session
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value: ThemeContextType = { theme, resolvedTheme, setTheme, toggleTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
