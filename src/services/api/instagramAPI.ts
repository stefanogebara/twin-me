/**
 * Instagram API client
 * =====================
 * Phase 1: cookies flow through the request body, NEVER persisted server-side.
 * Backend: api/routes/instagram.js
 */

import { API_URL, getAccessToken } from './apiBase';

export interface InstagramCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export type InstagramSurface = 'saved' | 'own_posts' | 'follows';

export interface InstagramStatus {
  connected: boolean;
  session: {
    instagram_username: string | null;
    status: 'connected' | 'needs_relogin' | 'rate_limited' | 'disconnected' | 'disabled_by_user';
    enabled_surfaces: InstagramSurface[];
    last_synced_at: string | null;
    last_sync_post_count: number | null;
    last_sync_error: string | null;
  } | null;
}

export interface InstagramSyncResult {
  ok: boolean;
  surfaces_scraped: InstagramSurface[];
  items_found: {
    saved: number;
    own_posts: number;
    follows: number;
  };
  observations_stored: number;
  duration_ms: number;
  detected?: {
    logged_in: boolean;
    captcha: boolean;
    rate_limit: boolean;
    suspended: boolean;
  };
  error?: string;
}

function authedHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!res.ok) {
    const msg = body.error || body.message || `request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export async function getInstagramStatus(): Promise<InstagramStatus> {
  const res = await fetch(`${API_URL}/instagram/status`, {
    method: 'GET',
    headers: authedHeaders(),
    credentials: 'include',
  });
  return jsonOrThrow<InstagramStatus>(res);
}

export async function recordInstagramConsent(args: { username: string; consentVersion: number }): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/instagram/consent`, {
    method: 'POST',
    headers: authedHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      username: args.username,
      consent_version: args.consentVersion,
    }),
  });
  return jsonOrThrow<{ success: boolean }>(res);
}

export async function syncInstagram(args: {
  cookies: InstagramCookie[];
  username?: string;
  surfaces?: InstagramSurface[];
}): Promise<InstagramSyncResult> {
  const res = await fetch(`${API_URL}/instagram/sync`, {
    method: 'POST',
    headers: authedHeaders(),
    credentials: 'include',
    body: JSON.stringify(args),
  });
  return jsonOrThrow<InstagramSyncResult>(res);
}

export async function updateInstagramSurfaces(enabledSurfaces: InstagramSurface[]): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/instagram/surfaces`, {
    method: 'PATCH',
    headers: authedHeaders(),
    credentials: 'include',
    body: JSON.stringify({ enabled_surfaces: enabledSurfaces }),
  });
  return jsonOrThrow<{ success: boolean }>(res);
}

export async function disconnectInstagram(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/instagram/session`, {
    method: 'DELETE',
    headers: authedHeaders(),
    credentials: 'include',
  });
  return jsonOrThrow<{ success: boolean }>(res);
}

export async function deleteInstagramData(): Promise<{ success: boolean; deleted_count: number }> {
  const res = await fetch(`${API_URL}/instagram/data`, {
    method: 'DELETE',
    headers: authedHeaders(),
    credentials: 'include',
  });
  return jsonOrThrow<{ success: boolean; deleted_count: number }>(res);
}

export async function getInstagramDataSummary(): Promise<{ success: boolean; memory_count: number }> {
  const res = await fetch(`${API_URL}/instagram/data-summary`, {
    method: 'GET',
    headers: authedHeaders(),
    credentials: 'include',
  });
  return jsonOrThrow<{ success: boolean; memory_count: number }>(res);
}

/**
 * Parse a cookies-export JSON string into the API's expected shape.
 * Accepts both EditThisCookie's array format and a plain JSON array.
 * Filters to instagram.com cookies only (defense against pasting other-domain cookies).
 */
export function parseCookiesExport(json: string): InstagramCookie[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON. Paste the array exported from your cookie extension.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array of cookie objects.');
  }
  const filtered: InstagramCookie[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.name !== 'string' || typeof c.value !== 'string') continue;
    const domain = typeof c.domain === 'string' ? c.domain : '';
    // Only IG-domain cookies. Either ".instagram.com" or "instagram.com" or subdomains.
    if (!/(^|\.)instagram\.com$/.test(domain.replace(/^\./, '').toLowerCase()) &&
        !domain.toLowerCase().includes('instagram.com')) {
      continue;
    }
    filtered.push({
      name: c.name,
      value: c.value,
      domain: domain || '.instagram.com',
      path: typeof c.path === 'string' ? c.path : '/',
      expires: typeof c.expires === 'number' ? c.expires : undefined,
      expirationDate: typeof c.expirationDate === 'number' ? c.expirationDate : undefined,
      httpOnly: typeof c.httpOnly === 'boolean' ? c.httpOnly : undefined,
      secure: typeof c.secure === 'boolean' ? c.secure : undefined,
      sameSite: typeof c.sameSite === 'string' ? c.sameSite : undefined,
    });
  }
  if (filtered.length === 0) {
    throw new Error('No instagram.com cookies found in the JSON. Make sure you exported cookies while on instagram.com.');
  }
  return filtered;
}
