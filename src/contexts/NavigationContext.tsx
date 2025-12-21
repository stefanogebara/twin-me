import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface NavigationHistoryItem {
  path: string;
  timestamp: number;
  title?: string;
}

interface NavigationContextType {
  history: NavigationHistoryItem[];
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  goHome: () => void;
  clearHistory: () => void;
  addToHistory: (path: string, title?: string) => void;
  currentPath: string;
  previousPath: string | null;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
};

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [history, setHistory] = useState<NavigationHistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [previousPath, setPreviousPath] = useState<string | null>(null);

  // Track navigation history
  useEffect(() => {
    const newItem: NavigationHistoryItem = {
      path: location.pathname,
      timestamp: Date.now(),
      title: document.title
    };

    setPreviousPath(history.length > 0 ? history[history.length - 1].path : null);

    setHistory(prev => {
      // Don't add duplicate consecutive entries
      if (prev.length > 0 && prev[prev.length - 1].path === location.pathname) {
        return prev;
      }
      // Keep only last 50 entries
      const updated = [...prev, newItem];
      setHistoryIndex(updated.length - 1);
      return updated.slice(-50);
    });
  }, [location.pathname]);

  // Keyboard shortcuts: Alt+Left (back), Alt+Right (forward)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Alt+Left Arrow = Go Back
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        goBack();
      }

      // Alt+Right Arrow = Go Forward
      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        goForward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  const canGoBack = history.length > 1;
  const canGoForward = historyIndex < history.length - 1;

  const goBack = () => {
    if (canGoBack) {
      navigate(-1);
    } else {
      // Fallback to home if no history
      navigate('/');
    }
  };

  const goForward = () => {
    if (canGoForward) {
      navigate(1);
    }
  };

  const goHome = () => {
    navigate('/');
  };

  const clearHistory = () => {
    setHistory([]);
    setHistoryIndex(-1);
  };

  const addToHistory = (path: string, title?: string) => {
    setHistory(prev => [...prev, {
      path,
      timestamp: Date.now(),
      title
    }]);
  };

  const value: NavigationContextType = {
    history,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    goHome,
    clearHistory,
    addToHistory,
    currentPath: location.pathname,
    previousPath
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};
