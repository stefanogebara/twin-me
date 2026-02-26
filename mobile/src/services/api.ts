import * as SecureStore from 'expo-secure-store';
import { API_URL, OAUTH_API_URL, STORAGE_KEYS } from '../constants';
import type { User, MemoryStats, TwinInsight, AndroidUsageData } from '../types';

function normalizeUser(u: Record<string, unknown>): User {
  const full = (u.fullName as string)
    || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
    || (u.email as string);
  return {
    id: u.id as string,
    email: u.email as string,
    full_name: full,
    name: full,
  };
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || err.message || 'Login failed');
  }
  const data = await res.json();
  return { token: data.token, user: normalizeUser(data.user) };
}

export async function register(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, firstName, lastName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sign up failed' }));
    throw new Error(err.error || err.message || 'Sign up failed');
  }
  const data = await res.json();
  return { token: data.token, user: normalizeUser(data.user) };
}

export async function claimAuthCode(authCode: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${OAUTH_API_URL}/auth/oauth/claim?auth_code=${encodeURIComponent(authCode)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'OAuth failed' }));
    throw new Error(err.error || 'OAuth claim failed');
  }
  const data = await res.json();
  if (!data.token) throw new Error('No token returned from OAuth claim');
  // Fetch user via verify since claim doesn't return full user object
  return { token: data.token, user: data.user };
}

export async function verifyToken(): Promise<User | null> {
  try {
    const res = await authFetch('/auth/verify');
    if (!res.ok) return null;
    const data = await res.json();
    return data.user ? normalizeUser(data.user) : null;
  } catch {
    return null;
  }
}

// ── Memory stats ─────────────────────────────────────────────────────────────

export async function fetchMemoryStats(): Promise<MemoryStats> {
  const res = await authFetch('/twin/memory-stats');
  if (!res.ok) throw new Error('Failed to fetch memory stats');
  const data = await res.json();
  return {
    total: data.totalMemories ?? data.total ?? 0,
    byPlatform: data.byPlatform ?? {},
    lastMemoryAt: data.lastMemoryAt ?? null,
  };
}

// ── Twin insights ─────────────────────────────────────────────────────────────

export async function fetchInsights(): Promise<TwinInsight[]> {
  const res = await authFetch('/twin/reflections?limit=5&diverse=true');
  if (!res.ok) throw new Error('Failed to fetch insights');
  const data = await res.json();
  const reflections = Array.isArray(data.reflections) ? data.reflections : [];
  return reflections.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    content: r.content as string,
    category: (r.category as string) ?? (r.expert as string) ?? 'reflection',
    created_at: r.createdAt as string,
    importance_score: (r.importance as number) ?? 5,
  }));
}

// ── Twin chat ─────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  message: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timeoutId = setTimeout(() => {
      xhr.abort();
      reject(new Error('Chat request timed out'));
    }, 45000);

    let lastLength = 0;

    xhr.open('POST', `${API_URL}/chat/message?stream=1`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onprogress = () => {
      const raw = xhr.responseText;
      const newData = raw.slice(lastLength);
      lastLength = raw.length;
      const lines = newData.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'chunk' && event.content) {
            onChunk(event.content);
          }
        } catch {
          // ignore partial JSON mid-stream
        }
      }
    };

    xhr.onload = () => {
      clearTimeout(timeoutId);
      if (xhr.status >= 400) {
        reject(new Error(`Chat request failed (${xhr.status})`));
      } else {
        resolve();
      }
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Network error during chat'));
    };

    xhr.send(JSON.stringify({ message }));
  });
}

// ── Android usage import ──────────────────────────────────────────────────────

export async function uploadAndroidUsage(usageData: AndroidUsageData): Promise<{
  importId: string;
  observationsCreated: number;
}> {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const fileName = 'android-usage.json';

  // Step 1 — get presigned upload URL
  const urlRes = await fetch(`${API_URL}/imports/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ platform: 'android_usage', fileName }),
  });
  if (!urlRes.ok) throw new Error('Failed to get upload URL');
  const { uploadUrl, storagePath } = await urlRes.json();

  // Step 2 — upload directly to Supabase Storage (bypasses Vercel body limit)
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(usageData),
  });
  if (!putRes.ok) throw new Error(`Storage upload failed (${putRes.status})`);

  // Step 3 — process the uploaded file
  const processRes = await fetch(`${API_URL}/imports/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ platform: 'android_usage', storagePath, fileName }),
  });
  if (!processRes.ok) throw new Error('Processing failed');
  const data = await processRes.json();
  return { importId: data.importId, observationsCreated: data.observationsCreated ?? 0 };
}
