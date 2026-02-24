import * as SecureStore from 'expo-secure-store';
import { API_URL, STORAGE_KEYS } from '../constants';
import type { User, MemoryStats, TwinInsight, AndroidUsageData } from '../types';

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
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
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || err.message || 'Login failed');
  }
  const data = await res.json();
  return { token: data.token, user: data.user };
}

export async function verifyToken(): Promise<User | null> {
  try {
    const res = await authFetch('/auth/verify');
    if (!res.ok) return null;
    const data = await res.json();
    return data.user ?? null;
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
    total: data.total ?? 0,
    byPlatform: data.byPlatform ?? {},
    lastMemoryAt: data.lastMemoryAt ?? null,
  };
}

// ── Twin insights ─────────────────────────────────────────────────────────────

export async function fetchInsights(): Promise<TwinInsight[]> {
  const res = await authFetch('/twin/insights');
  if (!res.ok) throw new Error('Failed to fetch insights');
  const data = await res.json();
  return Array.isArray(data.insights) ? data.insights : [];
}

// ── Twin chat ─────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  message: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  const res = await fetch(`${API_URL}/twin/chat/message?stream=1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) throw new Error('Chat request failed');
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const text = line.slice(6);
        if (text && text !== '[DONE]') {
          try {
            const parsed = JSON.parse(text);
            if (parsed.content) onChunk(parsed.content);
          } catch {
            if (text !== '[DONE]') onChunk(text);
          }
        }
      }
    }
  }
}

// ── Android usage import ──────────────────────────────────────────────────────

export async function uploadAndroidUsage(usageData: AndroidUsageData): Promise<{
  importId: string;
  observationsCreated: number;
}> {
  const json = JSON.stringify(usageData);
  const blob = new Blob([json], { type: 'application/json' });
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);

  const formData = new FormData();
  formData.append('platform', 'android_usage');
  formData.append('file', blob as unknown as File, 'android-usage.json');

  const res = await fetch(`${API_URL}/imports/gdpr`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });

  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return { importId: data.importId, observationsCreated: data.observationsCreated ?? 0 };
}
