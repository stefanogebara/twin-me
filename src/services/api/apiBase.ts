/**
 * API Base - Shared utilities for all API modules
 */

// Prefer a same-origin relative base (`/api`) in the browser so cookies marked
// sameSite='strict' actually ride on API requests regardless of which Vercel
// alias the user hit (twinme.me vs twin-ai-learn.vercel.app). Cross-origin
// fetches strip Strict cookies, which was causing the "login loops to /auth"
// bug when VITE_API_URL was pinned to one alias but the user browsed another.
//
// VITE_API_URL is still honored when it points to a *localhost* dev server
// (e.g., http://localhost:3004) so `npm run dev` keeps working against a
// separate Express process.
const rawEnv = import.meta.env.VITE_API_URL;
const looksLikeLocalhost = typeof rawEnv === 'string' && /^(https?:\/\/)?(localhost|127\.0\.0\.1)/i.test(rawEnv);

export const API_URL: string = looksLikeLocalhost
  ? rawEnv
  : (typeof window !== 'undefined' ? '/api' : (rawEnv || '/api'));

// In-memory access token store (not in localStorage — XSS protection)
// Refresh token lives in an httpOnly cookie; on page load AuthContext calls
// refreshAccessToken() to rehydrate this variable from the cookie.
let currentAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function clearAccessToken(): void {
  currentAccessToken = null;
}

export interface AuthHeaders {
  'Content-Type': string;
  'Authorization'?: string;
}

export const getAuthHeaders = (): AuthHeaders => {
  const token = currentAccessToken;
  const headers: AuthHeaders = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

/**
 * Check if app is in demo mode.
 * Centralised so every fetch path can short-circuit without hitting the server.
 */
export const isDemoMode = (): boolean =>
  localStorage.getItem('demo_mode') === 'true';

/**
 * Build a synthetic Response that looks like a successful (but empty) API reply.
 * Callers that parse `.json()` get `{}`, which their null-coalescing fallbacks handle.
 */
const demoResponse = (body: unknown = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Authenticated fetch wrapper.
 * - In demo mode returns a synthetic 200 response (no network call)
 * - Auto-injects auth headers from getAuthHeaders()
 * - Prepends API_URL when the path starts with "/"
 * - Merges any additional headers from the caller
 * - Returns the raw Response without parsing
 */
export const authFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  // Demo mode: return empty success response — no real API call
  if (isDemoMode()) {
    return demoResponse();
  }

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
