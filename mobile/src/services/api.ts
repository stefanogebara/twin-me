import * as SecureStore from 'expo-secure-store';
import { API_URL, OAUTH_API_URL, STORAGE_KEYS } from '../constants';
import type { User, MemoryStats, TwinInsight, AndroidUsageData, SoulSignatureProfile, PersonalityScores, PlatformConnection } from '../types';

const MOBILE_CLIENT_HEADERS = {
  'X-Twin-Client': 'mobile',
} as const;

function normalizeUser(u: Record<string, unknown>): User {
  const full = (u.fullName as string)
    || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
    || (u.email as string);
  return {
    id: u.id as string,
    email: u.email as string,
    full_name: full,
    name: full,
    created_at: (u.created_at as string) || (u.createdAt as string) || undefined,
  };
}

async function fetchWithAuthToken(path: string, token: string | null, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

export async function clearStoredSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN),
    SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN),
    SecureStore.deleteItemAsync(STORAGE_KEYS.USER),
  ]);
}

export async function refreshSession(): Promise<{ token: string; user: User } | null> {
  const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
  if (!refreshToken) {
    return null;
  }

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...MOBILE_CLIENT_HEADERS,
    },
    body: JSON.stringify({ refreshToken, client: 'mobile' }),
  });

  if (res.status === 401 || res.status === 403) {
    await clearStoredSession();
    return null;
  }

  if (!res.ok) {
    throw new Error(`Refresh failed (${res.status})`);
  }

  const data = await res.json();
  if (!data.accessToken || !data.user) {
    throw new Error('Invalid refresh response');
  }

  const user = normalizeUser(data.user);
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, data.accessToken),
    SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user)),
    data.refreshToken
      ? SecureStore.setItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN, data.refreshToken)
      : Promise.resolve(),
  ]);

  return { token: data.accessToken, user };
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  let response = await fetchWithAuthToken(path, token, options);

  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  const refreshed = await refreshSession().catch(() => null);
  if (!refreshed?.token) {
    return response;
  }

  response = await fetchWithAuthToken(path, refreshed.token, options);
  return response;
}

export async function apiPost(path: string, body: object): Promise<Response> {
  return authFetch(path, { method: 'POST', body: JSON.stringify(body) });
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<{ token: string; user: User; refreshToken?: string | null }> {
  const res = await fetch(`${API_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...MOBILE_CLIENT_HEADERS },
    body: JSON.stringify({ email, password, client: 'mobile' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || err.message || 'Login failed');
  }
  const data = await res.json();
  return { token: data.token, user: normalizeUser(data.user), refreshToken: data.refreshToken ?? null };
}

export async function register(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<{ token: string; user: User; refreshToken?: string | null }> {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...MOBILE_CLIENT_HEADERS },
    body: JSON.stringify({ email, password, firstName, lastName, client: 'mobile' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sign up failed' }));
    throw new Error(err.error || err.message || 'Sign up failed');
  }
  const data = await res.json();
  return { token: data.token, user: normalizeUser(data.user), refreshToken: data.refreshToken ?? null };
}

export async function claimAuthCode(authCode: string): Promise<{ token: string; user: User | null; refreshToken?: string | null }> {
  const res = await fetch(`${OAUTH_API_URL}/auth/oauth/claim?auth_code=${encodeURIComponent(authCode)}&client=mobile`, {
    headers: MOBILE_CLIENT_HEADERS,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'OAuth failed' }));
    throw new Error(err.error || 'OAuth claim failed');
  }
  const data = await res.json();
  if (!data.token) throw new Error('No token returned from OAuth claim');
  // Fetch user via verify since claim doesn't return full user object
  return { token: data.token, user: data.user ? normalizeUser(data.user) : null, refreshToken: data.refreshToken ?? null };
}

export async function verifyToken(): Promise<User | null> {
  const res = await authFetch('/auth/verify');
  if (res.status === 401 || res.status === 403) throw new Error('UNAUTHORIZED');
  if (!res.ok) return null;
  const data = await res.json();
  const user = data.user ? normalizeUser(data.user) : null;
  if (user) {
    await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));
  }
  return user;
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

// ── Soul portrait (Me tab) ────────────────────────────────────────────────────

export async function fetchSoulSignature(): Promise<SoulSignatureProfile | null> {
  try {
    const res = await authFetch('/soul-signature/profile');
    if (!res.ok) return null;
    const data = await res.json();
    return data.profile ?? null;
  } catch {
    return null;
  }
}

export async function fetchPersonalityScores(): Promise<PersonalityScores | null> {
  try {
    const res = await authFetch('/soul-signature/personality-scores');
    if (!res.ok) return null;
    const data = await res.json();
    return data.data ?? data.scores ?? null;
  } catch {
    return null;
  }
}

export async function fetchPlatformConnections(userId: string): Promise<PlatformConnection[]> {
  try {
    const res = await authFetch(`/connectors/status/${userId}`);
    if (!res.ok) return [];
    const json = await res.json();
    // Response: { success, data: { spotify: {isActive, ...}, youtube: {...}, ... } }
    const platforms = json.data ?? {};
    return Object.entries(platforms).map(([platform, info]) => ({
      platform,
      status: (info as Record<string, unknown>)?.isActive ? 'connected' : 'error',
      last_sync_at: (info as Record<string, unknown>)?.lastSync as string | undefined,
    }));
  } catch {
    return [];
  }
}

// ── Twin chat ─────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  message: string,
  onChunk: (text: string) => void,
): Promise<void> {
  let initialToken = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  if (!initialToken) {
    const refreshed = await refreshSession().catch(() => null);
    initialToken = refreshed?.token ?? null;
  }

  return new Promise((resolve, reject) => {
    const attemptSend = (token: string | null, allowRetry: boolean) => {
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

        if ((xhr.status === 401 || xhr.status === 403) && allowRetry) {
          refreshSession()
            .then(refreshed => {
              if (!refreshed?.token) {
                reject(new Error(`Chat request failed (${xhr.status})`));
                return;
              }
              attemptSend(refreshed.token, false);
            })
            .catch(() => reject(new Error(`Chat request failed (${xhr.status})`)));
          return;
        }

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
    };

    attemptSend(initialToken, true);
  });
}

// ── Health Connect import ─────────────────────────────────────────────────────

export async function uploadHealthConnectData(hcData: object): Promise<{
  importId: string;
  observationsCreated: number;
}> {
  const fileName = 'health-connect.json';

  const urlRes = await authFetch('/imports/upload-url', {
    method: 'POST',
    body: JSON.stringify({ platform: 'android_health', fileName }),
  });
  if (!urlRes.ok) throw new Error('Failed to get Health Connect upload URL');
  const { uploadUrl, storagePath } = await urlRes.json();

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hcData),
  });
  if (!putRes.ok) throw new Error(`Health Connect storage upload failed (${putRes.status})`);

  const processRes = await authFetch('/imports/process', {
    method: 'POST',
    body: JSON.stringify({ platform: 'android_health', storagePath, fileName }),
  });
  if (!processRes.ok) throw new Error('Health Connect processing failed');
  const data = await processRes.json();
  return { importId: data.importId, observationsCreated: data.observationsCreated ?? 0 };
}

// ── Android usage import ──────────────────────────────────────────────────────

export async function uploadAndroidUsage(usageData: AndroidUsageData): Promise<{
  importId: string;
  observationsCreated: number;
}> {
  const fileName = 'android-usage.json';

  // Step 1 — get presigned upload URL
  const urlRes = await authFetch('/imports/upload-url', {
    method: 'POST',
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
  const processRes = await authFetch('/imports/process', {
    method: 'POST',
    body: JSON.stringify({ platform: 'android_usage', storagePath, fileName }),
  });
  if (!processRes.ok) throw new Error('Processing failed');
  const data = await processRes.json();
  return { importId: data.importId, observationsCreated: data.observationsCreated ?? 0 };
}
