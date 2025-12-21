/**
 * Button Loading State Hook
 * Purpose: Manage loading states for individual buttons
 */

import { useState, useCallback } from 'react';

export interface UseButtonLoadingReturn {
  isLoading: boolean;
  startLoading: () => void;
  stopLoading: () => void;
  withLoading: <T>(operation: () => Promise<T>) => Promise<T>;
}

export function useButtonLoading(initialState = false): UseButtonLoadingReturn {
  const [isLoading, setIsLoading] = useState(initialState);

  const startLoading = useCallback(() => {
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  const withLoading = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    try {
      setIsLoading(true);
      const result = await operation();
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    startLoading,
    stopLoading,
    withLoading
  };
}

// Hook for managing multiple button loading states
export interface UseMultiButtonLoadingReturn {
  isLoading: (id: string) => boolean;
  startLoading: (id: string) => void;
  stopLoading: (id: string) => void;
  withLoading: <T>(id: string, operation: () => Promise<T>) => Promise<T>;
  isAnyLoading: () => boolean;
  clearAll: () => void;
}

export function useMultiButtonLoading(): UseMultiButtonLoadingReturn {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

  const isLoading = useCallback((id: string) => {
    return loadingStates[id] || false;
  }, [loadingStates]);

  const startLoading = useCallback((id: string) => {
    setLoadingStates(prev => ({ ...prev, [id]: true }));
  }, []);

  const stopLoading = useCallback((id: string) => {
    setLoadingStates(prev => {
      const newState = { ...prev };
      delete newState[id];
      return newState;
    });
  }, []);

  const withLoading = useCallback(async <T,>(id: string, operation: () => Promise<T>): Promise<T> => {
    try {
      startLoading(id);
      const result = await operation();
      return result;
    } finally {
      stopLoading(id);
    }
  }, [startLoading, stopLoading]);

  const isAnyLoading = useCallback(() => {
    return Object.values(loadingStates).some(Boolean);
  }, [loadingStates]);

  const clearAll = useCallback(() => {
    setLoadingStates({});
  }, []);

  return {
    isLoading,
    startLoading,
    stopLoading,
    withLoading,
    isAnyLoading,
    clearAll
  };
}

export default useButtonLoading;
