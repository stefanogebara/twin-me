import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LoadingState {
  [key: string]: boolean;
}

interface LoadingContextType {
  loading: LoadingState;
  setLoading: (key: string, isLoading: boolean) => void;
  isLoading: (key: string) => boolean;
  isAnyLoading: () => boolean;
  clearAllLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

interface LoadingProviderProps {
  children: ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  const [loading, setLoadingState] = useState<LoadingState>({});

  const setLoading = (key: string, isLoading: boolean) => {
    setLoadingState(prev => ({
      ...prev,
      [key]: isLoading
    }));
  };

  const isLoading = (key: string) => {
    return loading[key] || false;
  };

  const isAnyLoading = () => {
    return Object.values(loading).some(Boolean);
  };

  const clearAllLoading = () => {
    setLoadingState({});
  };

  return (
    <LoadingContext.Provider value={{
      loading,
      setLoading,
      isLoading,
      isAnyLoading,
      clearAllLoading
    }}>
      {children}
    </LoadingContext.Provider>
  );
};