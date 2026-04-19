import React, { createContext, useContext, useState, useEffect } from 'react';

type BackgroundMode = 'natural' | 'dark';

interface BackgroundModeContextValue {
  mode: BackgroundMode;
  setMode: (mode: BackgroundMode) => void;
}

const BackgroundModeContext = createContext<BackgroundModeContextValue>({
  mode: 'natural',
  setMode: () => {},
});

export const useBackgroundMode = () => useContext(BackgroundModeContext);

export const BackgroundModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<BackgroundMode>(() => {
    const stored = localStorage.getItem('bg_mode');
    return stored === 'dark' ? 'dark' : 'natural';
  });

  const setMode = (next: BackgroundMode) => {
    localStorage.setItem('bg_mode', next);
    setModeState(next);
  };

  return (
    <BackgroundModeContext.Provider value={{ mode, setMode }}>
      {children}
    </BackgroundModeContext.Provider>
  );
};
