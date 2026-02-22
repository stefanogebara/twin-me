import React, { createContext, useContext, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * ThemeProvider — Light mode only.
 * We use the landing page cream palette (#F7F7F3) consistently.
 * The toggleTheme is a no-op kept for API compatibility.
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Force light mode — remove any stored dark preference
  if (typeof window !== 'undefined') {
    localStorage.removeItem('theme');
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
  }

  const value: ThemeContextType = {
    theme: 'light',
    toggleTheme: () => {
      // No-op: light mode only for now
    },
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
