import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface ErrorInfo {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info' | 'success';
  timestamp: Date;
  autoHide?: boolean;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ErrorContextType {
  errors: ErrorInfo[];
  addError: (error: Omit<ErrorInfo, 'id' | 'timestamp'>) => void;
  removeError: (id: string) => void;
  clearAllErrors: () => void;
  showError: (message: string, options?: Partial<ErrorInfo>) => void;
  showSuccess: (message: string, options?: Partial<ErrorInfo>) => void;
  showWarning: (message: string, options?: Partial<ErrorInfo>) => void;
  showInfo: (message: string, options?: Partial<ErrorInfo>) => void;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

export const useError = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};

interface ErrorProviderProps {
  children: ReactNode;
}

export const ErrorProvider: React.FC<ErrorProviderProps> = ({ children }) => {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);

  const addError = (error: Omit<ErrorInfo, 'id' | 'timestamp'>) => {
    const newError: ErrorInfo = {
      ...error,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      autoHide: error.autoHide ?? true,
      duration: error.duration ?? 5000
    };

    setErrors(prev => [...prev, newError]);

    // Auto-hide if specified
    if (newError.autoHide) {
      setTimeout(() => {
        removeError(newError.id);
      }, newError.duration);
    }
  };

  const removeError = (id: string) => {
    setErrors(prev => prev.filter(error => error.id !== id));
  };

  const clearAllErrors = () => {
    setErrors([]);
  };

  const showError = (message: string, options?: Partial<ErrorInfo>) => {
    addError({
      message,
      type: 'error',
      ...options
    });
  };

  const showSuccess = (message: string, options?: Partial<ErrorInfo>) => {
    addError({
      message,
      type: 'success',
      ...options
    });
  };

  const showWarning = (message: string, options?: Partial<ErrorInfo>) => {
    addError({
      message,
      type: 'warning',
      ...options
    });
  };

  const showInfo = (message: string, options?: Partial<ErrorInfo>) => {
    addError({
      message,
      type: 'info',
      ...options
    });
  };

  return (
    <ErrorContext.Provider value={{
      errors,
      addError,
      removeError,
      clearAllErrors,
      showError,
      showSuccess,
      showWarning,
      showInfo
    }}>
      {children}
    </ErrorContext.Provider>
  );
};