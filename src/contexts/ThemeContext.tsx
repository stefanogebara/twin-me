import React, { createContext, useContext, useEffect } from 'react';

type Theme = 'dark';
type ResolvedTheme = 'dark';

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

export function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  }, []);

  const value: ThemeContextType = {
    theme: 'dark',
    resolvedTheme: 'dark',
    setTheme: () => {},
    toggleTheme: () => {},
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
