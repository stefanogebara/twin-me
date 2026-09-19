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
  /** Her mobile in E.164 (+5511999990000); null until the family sets it. */
  elder_phone?: string | null;
  /** The local hour (0-23) the Presence calls her, read in call_timezone. */
  call_hour?: number;
  /** Weekdays the Presence calls, 0 = Sunday. */
  call_days?: number[];
  call_timezone?: string;
  elder_assent_at?: string | null;
  /** Whom the presence says it will tell "agora" when she speaks of pain, a fall, or asks for help. */
  emergency_name?: string | null;
  emergency_phone?: string | null;
}

/** The fields the family may change on PATCH; the server validates each. */
export type PresencePatch = Partial<Pick<PresenceRecord, 'cared_for_name' | 'relationship' | 'caller_name' | 'tone' | 'status' | 'elder_phone' | 'call_hour' | 'call_days' | 'call_timezone' | 'emergency_name' | 'emergency_phone'>>;

export interface PresenceCall {
  id: string;
  scheduled_for: string;
  attempt: number;
  status: 'dialing' | 'answered' | 'no_answer' | 'busy' | 'failed' | 'completed';
  direction: 'outbound' | 'inbound';
  failure_reason: string | null;
  conversation_id: string | null;
}

export interface PresencePersonInput {
  name: string;
  relation: string;
  called_by: string;
}

export type PresenceFactKind = 'tone' | 'language' | 'boundary' | 'anchor' | 'biography' | 'care_signal';

interface MineResponse {
  success: boolean;
  /** The signed-in user's place around her; absent when there is no presence. */
  role?: PresenceRole;
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

  patch: (id: string, fields: PresencePatch) =>
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
    request<PresenceOverview | CompanionOverview>(`/presence/${id}/overview`),

  // The people around her (owner only, except join).
  members: (id: string) =>
    request<{ success: boolean; members: PresenceMember[] }>(`/presence/${id}/members`),

  invite: (id: string, role: 'family' | 'companion') =>
    request<{ success: boolean; role: 'family' | 'companion'; expires_at: string; join_path: string }>(`/presence/${id}/invites`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  removeMember: (id: string, userId: string) =>
    request<{ success: boolean }>(`/presence/${id}/members/${userId}`, { method: 'DELETE' }),

  /** Accept an invite link. 404 unknown, 410 used or expired (PresenceApiError). */
  join: (token: string) =>
    request<{ success: boolean; presence_id: string; role: PresenceRole; cared_for_name: string }>(`/presence/join/${encodeURIComponent(token)}`, { method: 'POST' }),

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

/**
 * The family member's WhatsApp, through the app's linking endpoints
 * (api/routes/whatsapp-link.js). The code arrives on WhatsApp as a session
 * message, so the person must have written to the number first (the page
 * offers the wa.me link that opens that window).
 */
export const whatsappLink = {
  status: () => request<{ success: boolean; linked: boolean; phone?: string | null }>('/whatsapp-link/status'),
  request: (phone: string) =>
    request<{ success: boolean; retry_after_ms?: number }>('/whatsapp-link/link/request', { method: 'POST', body: JSON.stringify({ phone }) }),
  verify: (phone: string, code: string) =>
    request<{ success: boolean; reason?: string; attempts_remaining?: number }>('/whatsapp-link/link/verify', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  unlink: () => request<{ success: boolean }>('/whatsapp-link/unlink', { method: 'DELETE' }),
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

/** Owner: everything. Family: the page. Companion (acompanhante, cuidadora): notes and needs only. */
export type PresenceRole = 'owner' | 'family' | 'companion';

export interface PresenceMember {
  id: string;
  user_id: string;
  role: PresenceRole;
  invited_by: string | null;
  created_at: string;
}

/** What a companion sees: who she is, when she is called, the notes, and what needs a person. */
export interface CompanionOverview {
  success: boolean;
  role: 'companion';
  presence: Pick<PresenceRecord, 'id' | 'cared_for_name' | 'caller_name' | 'relationship' | 'status' | 'call_hour' | 'call_days' | 'call_timezone'>;
  notes: PresenceNote[];
  needs: Array<{ id: string; created_at: string; needs_family: string[]; urgency: string | null }>;
}

export interface PresenceOverview {
  success: boolean;
  role: 'owner' | 'family';
  presence: PresenceRecord & { call_token: string | null; elder_assent_at?: string | null };
  people: Array<{ id: string; name: string; relation: string; called_by: string }>;
  voice: { status: string; sample_count: number; sample_seconds: number } | null;
  facts: Array<{ id: string; kind: PresenceFactKind; question: string; answer: string; confidence?: 'committed' | 'provisional' | 'ask'; source?: string }>;
  notes: PresenceNote[];
  conversations: PresenceConversation[];
  /** The last ten calls, newest first. */
  calls: PresenceCall[];
  /** The family member's own WhatsApp, as linked in messaging_channels. */
  whatsapp: { linked: boolean; phone_last4: string | null };
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

/**
 * A dead link ('gone': the server does not know the token) and a channel that did not
 * answer this time ('unavailable': a 5xx or no network) are different news for her, so
 * the page can say "tente de novo" instead of "este link não está mais ativo".
 */
export type CallConfigResult = { call: PresenceCallConfig } | { error: 'gone' | 'unavailable' };

export async function fetchCallConfig(token: string): Promise<CallConfigResult> {
  try {
    const response = await fetch(`${API_URL}/presence-call/${encodeURIComponent(token)}`);
    if (response.status >= 500) return { error: 'unavailable' };
    if (!response.ok) return { error: 'gone' };
    const data = await response.json();
    return data?.call ? { call: data.call } : { error: 'unavailable' };
  } catch {
    return { error: 'unavailable' };
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
