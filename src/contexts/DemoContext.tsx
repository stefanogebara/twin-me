import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DemoContextType {
  isDemoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
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
  };

  const exitDemoMode = () => {
    localStorage.removeItem('demo_mode');
    setIsDemoMode(false);
  };

  const getDemoData = (key: string): any => {
    // Import demo data service
    const demoData = require('../services/demoDataService').DEMO_DATA;
    return demoData[key];
  };

  const value: DemoContextType = {
    isDemoMode,
    enterDemoMode,
    exitDemoMode,
    getDemoData,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
};
