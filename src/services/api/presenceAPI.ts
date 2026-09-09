/**
 * Presence API client — backs /presence/onboarding.
 *
 * Every call is best-effort and silent on failure (returns null): onboarding must
 * never block on the network, because the localStorage draft is the local source
 * of truth and the flow keeps working with the backend down (dev included).
 */
import { API_URL, authFetch, getAuthHeaders } from './apiBase';

export interface PresenceRecord {
  id: string;
  cared_for_name: string;
  relationship: string;
  caller_name: string;
  tone: string;
  status: 'draft' | 'active' | 'paused' | 'deleted';
}

export interface PresencePersonInput {
  name: string;
  relation: string;
  called_by: string;
}

export type PresenceFactKind = 'tone' | 'language' | 'boundary' | 'anchor' | 'biography' | 'care_signal';

interface MineResponse {
  success: boolean;
  presence: PresenceRecord | null;
  people?: Array<{ id: string; name: string; relation: string; called_by: string }>;
  voice?: { status: string; sample_count: number; sample_seconds: number } | null;
  facts?: Array<{ id: string; kind: PresenceFactKind; question: string; answer: string }>;
}

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const response = await authFetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export const presenceAPI = {
  mine: () => request<MineResponse>('/presence/mine'),

  create: (fields: Partial<Pick<PresenceRecord, 'cared_for_name' | 'relationship' | 'caller_name' | 'tone'>>) =>
    request<{ success: boolean; presence: PresenceRecord }>('/presence', {
      method: 'POST',
      body: JSON.stringify(fields),
    }),

  patch: (id: string, fields: Partial<Pick<PresenceRecord, 'cared_for_name' | 'relationship' | 'caller_name' | 'tone' | 'status'>>) =>
    request<{ success: boolean; presence: PresenceRecord }>(`/presence/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    }),

  consent: (id: string, kind: 'own_voice' | 'own_voice_revoked' | 'ai_disclosure', textVersion: string) =>
    request<{ success: boolean }>(`/presence/${id}/consent`, {
      method: 'POST',
      body: JSON.stringify({ kind, text_version: textVersion }),
    }),

  savePeople: (id: string, people: PresencePersonInput[]) =>
    request<{ success: boolean }>(`/presence/${id}/people`, {
      method: 'PUT',
      body: JSON.stringify({ people }),
    }),

  saveFact: (id: string, kind: PresenceFactKind, question: string, answer: string) =>
    request<{ success: boolean }>(`/presence/${id}/facts`, {
      method: 'POST',
      body: JSON.stringify({ kind, question, answer }),
    }),

  queueNote: (id: string, body: string) =>
    request<{ success: boolean }>(`/presence/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  voiceStatus: (id: string, status: 'samples_recorded' | 'queued', sampleCount: number, sampleSeconds: number) =>
    request<{ success: boolean }>(`/presence/${id}/voice-status`, {
      method: 'POST',
      body: JSON.stringify({ status, sample_count: sampleCount, sample_seconds: sampleSeconds }),
    }),

  createCallLink: (id: string) =>
    request<{ success: boolean; call_path: string; missing?: string[] }>(`/presence/${id}/call-link`, { method: 'POST' }),

  readiness: (id: string) =>
    request<PresenceReadiness>(`/presence/${id}/readiness`),

  /** "Tell me about her": voice note (audio blob) or typed text → extracted structure. */
  about: async (id: string, input: { audio?: Blob; text?: string }): Promise<PresenceAboutResult | null> => {
    try {
      const form = new FormData();
      if (input.audio) form.append('audio', input.audio, 'about.webm');
      if (input.text) form.append('text', input.text);
      // Multipart: the browser must set the boundary itself, so strip the JSON
      // content-type that getAuthHeaders() adds by default.
      const headers: Record<string, string> = { ...getAuthHeaders() };
      delete headers['Content-Type'];
      const response = await fetch(`${API_URL}/presence/${id}/about`, { method: 'POST', headers, body: form });
      if (!response.ok) return null;
      return (await response.json()) as PresenceAboutResult;
    } catch {
      return null;
    }
  },

  overview: (id: string) =>
    request<PresenceOverview>(`/presence/${id}/overview`),

  /** Upload one voice sample; the server clones (flag on) or queues (flag off). */
  uploadVoiceSample: async (id: string, audio: Blob, sampleSeconds: number): Promise<VoiceSampleResult | null> => {
    try {
      const form = new FormData();
      form.append('audio', audio, 'sample.webm');
      form.append('sample_seconds', String(sampleSeconds));
      const headers: Record<string, string> = { ...getAuthHeaders() };
      delete headers['Content-Type'];
      const response = await fetch(`${API_URL}/presence/${id}/voice-samples`, { method: 'POST', headers, body: form });
      if (!response.ok) return null;
      return (await response.json()) as VoiceSampleResult;
    } catch {
      return null;
    }
  },

  revokeVoice: (id: string) =>
    request<{ success: boolean; voice: { status: string } }>(`/presence/${id}/voice-revoke`, { method: 'POST' }),

  answerAsk: (id: string, factId: string, body: { action: 'add' | 'dismiss'; name?: string; relation?: string; called_by?: string }) =>
    request<{ success: boolean }>(`/presence/${id}/asks/${factId}`, { method: 'POST', body: JSON.stringify(body) }),

  conversation: (id: string, conversationId: string) =>
    request<{ success: boolean; conversation: PresenceConversationDetail }>(`/presence/${id}/conversations/${conversationId}`),
};

export interface PresenceConversationDetail {
  id: string;
  started_at: string;
  duration_seconds: number;
  turn_count: number;
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>;
  summary: string;
  needs_family: string[];
}

export interface VoiceSampleResult {
  success: boolean;
  clone_enabled: boolean;
  voice: { status: 'queued' | 'ready' | 'failed' | 'samples_recorded'; sample_count: number; sample_seconds: number; note: string };
}

export interface PresenceReadiness {
  success: boolean;
  ready: boolean;
  score: number;
  counts: { people: number; anchors: number; boundaries: number; biography: number; notes_queued: number; conversations: number };
  knows: string[];
  missing: string[];
  voice_status: string;
}

export interface PresenceAboutResult {
  success: boolean;
  transcript: string;
  extracted: {
    people: Array<{ name: string; relation: string; called_by: string }>;
    anchors: Array<{ label: string; value: string }>;
    boundaries: string[];
    facts: Array<{ question: string; answer: string }>;
    tone_hint: string;
  };
  saved: { people: number; facts: number };
}

export interface PresenceNote {
  id: string;
  body: string;
  status: 'queued' | 'delivered' | 'archived';
  created_at: string;
  delivered_at: string | null;
}

export interface PresenceConversation {
  id: string;
  started_at: string;
  ended_at: string | null;
  turn_count: number;
  duration_seconds: number;
  summary: string;
  needs_family: string[];
  status: 'recorded' | 'summarized' | 'failed';
}

export interface PresenceOverview {
  success: boolean;
  presence: PresenceRecord & { call_token: string | null };
  people: Array<{ id: string; name: string; relation: string; called_by: string }>;
  voice: { status: string; sample_count: number; sample_seconds: number } | null;
  facts: Array<{ id: string; kind: PresenceFactKind; question: string; answer: string; confidence?: 'committed' | 'provisional' | 'ask'; source?: string }>;
  notes: PresenceNote[];
  conversations: PresenceConversation[];
}

// ====================================================================
// Elder channel — PUBLIC endpoints (token is the auth; no session).
// ====================================================================

export interface PresenceCallConfig {
  agent_id: string;
  cared_for_name: string;
  caller_name: string;
  prompt: string;
  first_message: string;
  voice_id: string | null;
  language: string;
}

export async function fetchCallConfig(token: string): Promise<PresenceCallConfig | null> {
  try {
    const response = await fetch(`${API_URL}/presence-call/${encodeURIComponent(token)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.call ?? null;
  } catch {
    return null;
  }
}

export interface PresenceCallHome {
  cared_for_name: string;
  caller_name: string;
  waiting_notes: number;
  conversations: Array<{ id: string; started_at: string; recap: string }>;
}

/** Her home screen. Public (token-authed) and deliberately narrow — see the endpoint. */
export async function fetchCallHome(token: string): Promise<PresenceCallHome | null> {
  try {
    const response = await fetch(`${API_URL}/presence-call/${encodeURIComponent(token)}/home`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.home ?? null;
  } catch {
    return null;
  }
}

export async function completeCall(
  token: string,
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>,
  durationSeconds: number,
): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/presence-call/${encodeURIComponent(token)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, duration_seconds: durationSeconds }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
