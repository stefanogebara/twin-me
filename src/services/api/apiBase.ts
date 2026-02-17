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
 * Generic API error handler
 */
export const handleAPIError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
};
