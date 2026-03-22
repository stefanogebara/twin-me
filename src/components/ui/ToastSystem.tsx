/**
 * Enhanced Toast Notification System
 * Provides user feedback for actions, errors, and status updates
 * Built on top of the existing Radix UI Toast primitives
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './Toast';
import { CheckCircle, XCircle, AlertCircle, Info, Loader2 } from 'lucide-react';

// Toast types
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'default';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; // milliseconds, default 5000
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Toast state
interface ToastState {
  toasts: ToastMessage[];
}

// Toast actions
type ToastAction =
  | { type: 'ADD_TOAST'; payload: ToastMessage }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'CLEAR_ALL' };

// Toast reducer
function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, action.payload],
      };
    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter(toast => toast.id !== action.payload),
      };
    case 'CLEAR_ALL':
      return {
        ...state,
        toasts: [],
      };
    default:
      return state;
  }
}

// Toast context
interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (toast: Omit<ToastMessage, 'id'>) => string;
  hideToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Module-level API store — populated by ToastSystemProvider so toast.x() works outside React
let _toastApi: Pick<ToastContextType, 'showToast' | 'hideToast'> | null = null;

// Hook to use toast
export function useToastSystem() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastSystem must be used within ToastSystemProvider');
  }
  return context;
}

// Toast System Provider
export function ToastSystemProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, { toasts: [] });

  const showToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    dispatch({ type: 'ADD_TOAST', payload: { ...toast, id } });
    return id;
  }, []);

  const hideToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }, []);

  const clearAllToasts = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  // Populate module-level API so toast.x() works outside React components
  useEffect(() => {
    _toastApi = { showToast, hideToast };
    return () => { _toastApi = null; };
  }, [showToast, hideToast]);

  return (
    <ToastContext.Provider value={{ toasts: state.toasts, showToast, hideToast, clearAllToasts }}>
      <ToastProvider>
        {children}
        <ToastRenderer toasts={state.toasts} hideToast={hideToast} />
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

// Toast Renderer
function ToastRenderer({ toasts, hideToast }: { toasts: ToastMessage[]; hideToast: (id: string) => void }) {
  return (
    <>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => hideToast(toast.id)} />
      ))}
    </>
  );
}

// Individual Toast Item
function ToastItem({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const { type, title, description, action, duration = 5000 } = toast;

  // Auto-hide after duration (except loading toasts)
  React.useEffect(() => {
    if (type !== 'loading' && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [type, duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-400" />,
    error: <XCircle className="w-5 h-5 text-red-400" />,
    warning: <AlertCircle className="w-5 h-5 text-muted-foreground" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
    loading: <Loader2 className="w-5 h-5 text-[var(--accent-vibrant)] animate-spin" />,
    default: null,
  };

  const variant = type === 'error' ? 'destructive' : 'default';

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- variant cast needed for shadcn Toast component
    <Toast variant={variant as any} duration={duration}>
      <div className="flex items-start gap-3">
        {icons[type] && <span className="flex-shrink-0 mt-0.5">{icons[type]}</span>}
        <div className="flex-1">
          <ToastTitle>{title}</ToastTitle>
          {description && <ToastDescription>{description}</ToastDescription>}
        </div>
      </div>
      {action && (
        <ToastAction altText={action.label} onClick={action.onClick}>
          {action.label}
        </ToastAction>
      )}
      {type !== 'loading' && <ToastClose />}
    </Toast>
  );
}

// Convenience toast object with methods — uses module-level API, safe to call outside React
export const toast = {
  success: (title: string, description?: string, duration?: number) => {
    return _toastApi?.showToast({ type: 'success', title, description, duration }) ?? '';
  },

  error: (title: string, description?: string, duration?: number) => {
    return _toastApi?.showToast({ type: 'error', title, description, duration }) ?? '';
  },

  warning: (title: string, description?: string, duration?: number) => {
    return _toastApi?.showToast({ type: 'warning', title, description, duration }) ?? '';
  },

  info: (title: string, description?: string, duration?: number) => {
    return _toastApi?.showToast({ type: 'info', title, description, duration }) ?? '';
  },

  loading: (title: string, description?: string) => {
    return _toastApi?.showToast({ type: 'loading', title, description, duration: 0 }) ?? '';
  },

  custom: (title: string, description?: string, action?: { label: string; onClick: () => void }) => {
    return _toastApi?.showToast({ type: 'default', title, description, action }) ?? '';
  },

  promise: async <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- error can be any thrown value
      error: string | ((error: any) => string);
    }
  ): Promise<T> => {
    const loadingId = _toastApi?.showToast({ type: 'loading', title: messages.loading, duration: 0 }) ?? '';

    try {
      const result = await promise;
      _toastApi?.hideToast(loadingId);
      const successMessage = typeof messages.success === 'function' ? messages.success(result) : messages.success;
      _toastApi?.showToast({ type: 'success', title: successMessage });
      return result;
    } catch (error) {
      _toastApi?.hideToast(loadingId);
      const errorMessage = typeof messages.error === 'function' ? messages.error(error) : messages.error;
      _toastApi?.showToast({ type: 'error', title: errorMessage });
      throw error;
    }
  },
};

// Example usage component
export function ToastExamples() {
  const { showToast } = useToastSystem();

  return (
    <div className="space-y-2">
      <button
        onClick={() => toast.success('Profile Updated', 'Your soul signature has been refreshed')}
        className="px-4 py-2 bg-green-600 text-white rounded"
      >
        Show Success
      </button>

      <button
        onClick={() => toast.error('Connection Failed', 'Unable to connect to Spotify. Please try again.')}
        className="px-4 py-2 bg-red-600 text-white rounded"
      >
        Show Error
      </button>

      <button
        onClick={() => {
          toast.promise(
            new Promise(resolve => setTimeout(() => resolve('Done!'), 3000)),
            {
              loading: 'Extracting soul data...',
              success: 'Soul data extracted successfully!',
              error: 'Failed to extract soul data',
            }
          );
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Show Promise
      </button>

      <button
        onClick={() =>
          showToast({
            type: 'info',
            title: 'New Platform Available',
            description: 'Discord integration is now ready',
            action: {
              label: 'Connect Now',
              onClick: () => { /* Action handled */ },
            },
          })
        }
        className="px-4 py-2 bg-orange-600 text-white rounded"
      >
        Show with Action
      </button>
    </div>
  );
}