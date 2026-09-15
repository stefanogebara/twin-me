/**
 * Presence API client — backs /presence/onboarding, /presence/home and /call/:token.
 *
 * A failed request throws PresenceApiError (status, message) so the page can say
 * what did not happen. The onboarding still keeps its localStorage draft as the
 * local source of truth and syncs best-effort; it catches and shows, it never
 * blocks on the network.
 */
import { API_URL, authFetch, getAuthHeaders } from './apiBase';

export class PresenceApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PresenceApiError';
    this.status = status;
  }
}

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

/** The server's error line, or a status-shaped one when the body is not JSON. */
async function errorOf(response: Response): Promise<PresenceApiError> {
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') message = body.error;
  } catch {
    /* not JSON */
  }
  return new PresenceApiError(response.status, message);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await authFetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    });
  } catch (err) {
    throw new PresenceApiError(0, err instanceof Error ? err.message : 'network');
  }
  if (!response.ok) throw await errorOf(response);
  return (await response.json()) as T;
}

/** Multipart: the browser must set the boundary itself, so the JSON content-type is stripped. */
async function upload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = { ...getAuthHeaders() };
  delete headers['Content-Type'];
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: form });
  } catch (err) {
    throw new PresenceApiError(0, err instanceof Error ? err.message : 'network');
  }
  if (!response.ok) throw await errorOf(response);
  return (await response.json()) as T;
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

  /** Soft delete: the presence, her link and her calls are gone from every screen. */
  remove: (id: string) =>
    request<{ success: boolean; deleted: boolean }>(`/presence/${id}`, { method: 'DELETE' }),

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
    request<{ success: boolean; note: PresenceNote }>(`/presence/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  createCallLink: (id: string) =>
    request<{ success: boolean; call_path: string; missing?: string[] }>(`/presence/${id}/call-link`, { method: 'POST' }),

  readiness: (id: string) =>
    request<PresenceReadiness>(`/presence/${id}/readiness`),

  /** "Me conta sobre ela": voice note (audio blob) or typed text → extracted structure. */
  about: (id: string, input: { audio?: Blob; text?: string }) => {
    const form = new FormData();
    if (input.audio) form.append('audio', input.audio, 'about.webm');
    if (input.text) form.append('text', input.text);
    return upload<PresenceAboutResult>(`/presence/${id}/about`, form);
  },

  overview: (id: string) =>
    request<PresenceOverview>(`/presence/${id}/overview`),

  /** Upload one voice sample. 503 (PresenceApiError) while cloning is not enabled. */
  uploadVoiceSample: (id: string, audio: Blob, sampleSeconds: number) => {
    const form = new FormData();
    form.append('audio', audio, 'sample.webm');
    form.append('sample_seconds', String(sampleSeconds));
    return upload<VoiceSampleResult>(`/presence/${id}/voice-samples`, form);
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
  voice: { status: 'ready' | 'failed' | 'samples_recorded' | 'revoked'; sample_count: number; sample_seconds: number; note: string };
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
    anchors: Array<{ kind: 'place' | 'dish' | 'person' | 'other'; value: string }>;
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
  urgency?: 'normal' | 'high';
  status: 'recorded' | 'summarized' | 'failed';
}

export interface PresenceOverview {
  success: boolean;
  presence: PresenceRecord & { call_token: string | null; elder_assent_at?: string | null };
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
  /** Server-issued WebRTC session for the private agent; null without an ElevenLabs key (local dev). */
  conversation_token: string | null;
  presence_id: string;
  cared_for_name: string;
  caller_name: string;
  prompt: string;
  first_message: string;
  voice_id: string | null;
  /** ElevenLabs language code, 'pt-br'. */
  language: string;
  /** True until she has said yes on the assent screen. */
  assent_required: boolean;
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

/** Her "Sim, pode" on the assent screen. */
export async function recordAssent(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/presence-call/${encodeURIComponent(token)}/assent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface CompleteCallInput {
  /** The id ElevenLabs gave the session; required when the server holds a key. */
  conversation_id: string | null;
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>;
  duration_seconds: number;
}

export async function completeCall(token: string, input: CompleteCallInput): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch(`${API_URL}/presence-call/${encodeURIComponent(token)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
