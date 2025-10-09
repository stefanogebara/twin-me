import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  success: boolean;
}

export interface UseAsyncOperationOptions<T = unknown> {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useAsyncOperation<T = unknown>(
  options: UseAsyncOperationOptions<T> = {}
) {
  const {
    showSuccessToast = false,
    showErrorToast = true,
    successMessage = 'Operation completed successfully',
    errorMessage = 'An error occurred',
    onSuccess,
    onError
  } = options;

  const { toast } = useToast();

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
    success: false
  });

  const execute = useCallback(
    async (asyncFunction: () => Promise<T>) => {
      setState(prev => ({
        ...prev,
        loading: true,
        error: null,
        success: false
      }));

      try {
        const result = await asyncFunction();

        setState({
          data: result,
          loading: false,
          error: null,
          success: true
        });

        if (showSuccessToast) {
          toast({
            title: "Success",
            description: successMessage,
          });
        }

        onSuccess?.(result);
        return result;

      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));

        setState(prev => ({
          ...prev,
          loading: false,
          error: errorObj,
          success: false
        }));

        if (showErrorToast) {
          toast({
            title: "Error",
            description: errorObj.message || errorMessage,
            variant: "destructive"
          });
        }

        onError?.(errorObj);
        throw errorObj;
      }
    },
    [toast, showSuccessToast, showErrorToast, successMessage, errorMessage, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
      success: false
    });
  }, []);

  const setData = useCallback((data: T) => {
    setState(prev => ({
      ...prev,
      data,
      success: true,
      error: null
    }));
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData
  };
}

// Specialized hooks for common operations
export function useTwinOperation() {
  return useAsyncOperation({
    showSuccessToast: true,
    showErrorToast: true,
    successMessage: 'Twin operation completed successfully'
  });
}

export function useFileUpload() {
  return useAsyncOperation({
    showSuccessToast: true,
    showErrorToast: true,
    successMessage: 'File uploaded successfully',
    errorMessage: 'Failed to upload file'
  });
}

export function useChatOperation() {
  return useAsyncOperation({
    showSuccessToast: false,
    showErrorToast: true,
    errorMessage: 'Failed to send message'
  });
}

export function useAuthOperation() {
  return useAsyncOperation({
    showSuccessToast: false,
    showErrorToast: true,
    errorMessage: 'Authentication failed'
  });
}