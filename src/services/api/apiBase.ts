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

/**
 * Notify the TwinMe browser extension whenever the access token changes.
 * The extension's content script (twinme-auth-sync.js) listens for this
 * event AND polls window.__twinmeGetAccessToken as a fallback. Without
 * this bridge, the extension never gets a JWT and silently fails all
 * /api/extension/* calls (that was the cause of the 35-day-stale sync).
 *
 * Safe to expose: chrome-extension content scripts run in an isolated
 * world but DO see CustomEvents on window. This is the documented pattern
 * for page↔content-script communication.
 */
function notifyExtensionTokenChange(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('twinme:tokenchange', {
      detail: { token },
    }));
  } catch {
    // Older browsers may not support CustomEvent constructor; ignore.
  }
}

// Expose a getter for the extension to poll as fallback if it missed the event
// (e.g. content script loaded mid-session after the dispatch already fired).
if (typeof window !== 'undefined') {
  (window as unknown as { __twinmeGetAccessToken?: () => string | null }).__twinmeGetAccessToken =
    () => currentAccessToken;
}

/**
 * Hand the access token to the TwinMe desktop app (Tauri) when running inside
 * it, so the headless clip/meeting sync (Rust, sync.rs) can authenticate its
 * uploads. No-op in a normal browser — window.__TAURI__ is undefined. The
 * desktop command is scoped to twinme.me only (desktop
 * capabilities/twinme-auth-bridge.json) and re-validates the token shape before
 * persisting it to the OS keyring, so this only ever hands over the user's own
 * already-minted access token.
 */
function pushTokenToDesktop(token: string | null): void {
  if (typeof window === 'undefined' || !token) return;
  const invoke = (window as unknown as {
    __TAURI__?: { core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
  }).__TAURI__?.core?.invoke;
  if (typeof invoke !== 'function') return;
  try {
    void invoke('store_auth_token', { token }).catch(() => { /* desktop-only; ignore */ });
  } catch {
    // Not running in Tauri / command unavailable; ignore.
  }
}

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
  notifyExtensionTokenChange(token);
  pushTokenToDesktop(token);
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function clearAccessToken(): void {
  currentAccessToken = null;
  notifyExtensionTokenChange(null);
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
 * Authenticated fetch wrapper.
 * - Auto-injects auth headers from getAuthHeaders()
 * - Prepends API_URL when the path starts with "/"
 * - Merges any additional headers from the caller
 * - Returns the raw Response without parsing
 *
 * audit-2026-05-23 demo mode plumbing removed
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

/**
 * Detect AbortError thrown by AbortController / React 18 StrictMode cleanup.
 *
 * audit-2026-05-08 Frontend MED-1: every page-level fetch should branch on
 * this so the StrictMode double-effect doesn't (a) flip the UI to an error
 * state, (b) flood the console with `Failed to fetch ...`, or (c) trip
 * Sentry/PostHog with phantom errors.
 *
 * Pattern at the call site:
 *   try { await authFetch(...) }
 *   catch (err) {
 *     if (isAbortError(err)) return;     // benign — drop it
 *     // ...real error handling...
 *   }
 */
export const isAbortError = (error: unknown): boolean => {
  if (!error) return false;
  if (typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError';
};
