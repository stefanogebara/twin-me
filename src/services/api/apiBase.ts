/**
 * API Base - Shared utilities for all API modules
 */

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface AuthHeaders {
  'Content-Type': string;
  'Authorization'?: string;
}

export const getAuthHeaders = (): AuthHeaders => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: AuthHeaders = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

/**
 * Authenticated fetch wrapper.
 * - Auto-injects auth headers from getAuthHeaders()
 * - Prepends API_URL when the path starts with "/"
 * - Merges any additional headers from the caller
 * - Returns the raw Response without parsing
 */
export const authFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  const fullUrl = url.startsWith('/') ? `${API_URL}${url}` : url;
  const authHeaders = getAuthHeaders();
  return fetch(fullUrl, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options?.headers || {}),
    },
  });
};

/**
 * Generic API error handler
 */
export const handleAPIError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
};
