import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DEMO_DATA } from '../services/demoDataService';

interface DemoContextType {
  isDemoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- demo data can be any shape
  getDemoData: (key: string) => any;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export const useDemo = () => {
  const context = useContext(DemoContext);
  if (context === undefined) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
};

interface DemoProviderProps {
  children: ReactNode;
}

export const DemoProvider: React.FC<DemoProviderProps> = ({ children }) => {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  useEffect(() => {
    // Check localStorage for demo mode state
    const demoMode = localStorage.getItem('demo_mode') === 'true';
    setIsDemoMode(demoMode);
  }, []);

  const enterDemoMode = () => {
    localStorage.setItem('demo_mode', 'true');
    setIsDemoMode(true);
    // Notify AuthContext (same-tab localStorage changes don't fire 'storage' event)
    window.dispatchEvent(new CustomEvent('demo-mode-change', { detail: { active: true } }));
  };

  const exitDemoMode = () => {
    localStorage.removeItem('demo_mode');
    setIsDemoMode(false);
    window.dispatchEvent(new CustomEvent('demo-mode-change', { detail: { active: false } }));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- demo data can be any shape
  const getDemoData = (key: string): any => {
    return DEMO_DATA[key];
  };

  const value: DemoContextType = {
    isDemoMode,
    enterDemoMode,
    exitDemoMode,
    getDemoData,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
};
