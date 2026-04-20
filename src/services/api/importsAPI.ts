/**
 * Imports API Client
 * Handles GDPR / platform data export uploads and import history.
 *
 * Upload flow (bypasses Vercel 4.5 MB body limit):
 *   1. POST /imports/upload-url  → get a presigned Supabase Storage URL
 *   2. PUT  {signedUrl}          → upload file directly to Supabase Storage
 *   3. POST /imports/process     → backend downloads, parses, and deletes the file
 */

import { API_URL, getAccessToken } from './apiBase';

export type ImportPlatform =
  | 'spotify' | 'youtube' | 'discord' | 'reddit' | 'apple_health'
  | 'google_search' | 'whatsapp' | 'whoop'
  // Data-export only platforms (no live API as of April 2026)
  | 'letterboxd' | 'goodreads'
  | 'netflix' | 'tiktok' | 'x_archive'
  // Music export-only (live APIs cap history too aggressively)
  | 'apple_music' | 'soundcloud'
  // Professional identity (GDPR export only — live API capped at basic fields)
  | 'linkedin'
  // Instagram GDPR JSON export (Graph API only works for Business/Creator accounts)
  | 'instagram';
export type ChatPlatform = 'whatsapp_chat' | 'telegram_chat';
export type ChatContext = 'close_friend' | 'family' | 'professional' | 'romantic_partner';

export interface ChatImportOpts {
  ownerName?: string;    // WhatsApp: your display name (inferred if blank)
  myName?: string;       // Telegram: your display name in the export
  myId?: string;         // Telegram: your numeric user ID
  chatName?: string;     // Optional label
  chatContext?: ChatContext; // Relationship context — shapes memory content
}

export interface ChatImportResult {
  memoriesStored: number;
  observationsStored: number;
  factsStored: number;
  parseStats: { total: number; owner_sent: number; owner_name?: string };
  processStats: { qa_pairs: number; my_messages: number };
  stylometricFeatures?: {
    avgWordsPerMessage: number;
    capitalizationStyle: string;
    emojiRatio: number;
    topEmojis: string[];
  } | null;
}

export interface DataImport {
  id: string;
  platform: ImportPlatform;
  status: 'processing' | 'completed' | 'error';
  observations_created: number;
  facts_created: number;
  file_name: string | null;
  file_size_bytes: number | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface GdprImportResult {
  importId: string;
  observationsCreated: number;
  factsCreated: number;
  error?: string;
}

function getAuthToken(): string | null {
  return getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const importsAPI = {
  /**
   * Upload a platform GDPR export file.
   *
   * Steps:
   *   1. Get a presigned upload URL from the backend
   *   2. PUT the file directly to Supabase Storage (no Vercel body limit)
   *   3. Tell the backend to process the uploaded file
   */
  uploadGdpr: async (platform: ImportPlatform, file: File): Promise<GdprImportResult> => {
    // Step 1 — get presigned upload URL
    const urlRes = await fetch(`${API_URL}/imports/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ platform, fileName: file.name }),
    });
    const urlJson = await urlRes.json();
    if (!urlRes.ok || !urlJson.success) {
      throw new Error(urlJson.error || `Failed to get upload URL (${urlRes.status})`);
    }
    const { uploadUrl, storagePath } = urlJson as { uploadUrl: string; storagePath: string };

    // Step 2 — upload directly to Supabase Storage (bypasses Vercel)
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(`Storage upload failed (${putRes.status})`);
    }

    // Step 3 — process the uploaded file on the backend
    const processRes = await fetch(`${API_URL}/imports/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ platform, storagePath, fileName: file.name }),
    });
    const processJson = await processRes.json();
    if (!processRes.ok || !processJson.success) {
      throw new Error(processJson.error || `Processing failed (${processRes.status})`);
    }

    return {
      importId: processJson.importId,
      observationsCreated: processJson.observationsCreated,
      factsCreated: processJson.factsCreated,
    };
  },

  /**
   * Upload a chat history export (WhatsApp .txt or Telegram result.json).
   * Uses the same presigned-URL flow to bypass Vercel body limits.
   */
  uploadChatHistory: async (
    platform: ChatPlatform,
    file: File,
    opts: ChatImportOpts = {}
  ): Promise<ChatImportResult> => {
    // Step 1 — get presigned upload URL
    const urlRes = await fetch(`${API_URL}/imports/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ platform, fileName: file.name }),
    });
    const urlJson = await urlRes.json();
    if (!urlRes.ok || !urlJson.success) {
      throw new Error(urlJson.error || `Failed to get upload URL (${urlRes.status})`);
    }
    const { uploadUrl, storagePath } = urlJson as { uploadUrl: string; storagePath: string };

    // Step 2 — upload directly to Supabase Storage
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(`Storage upload failed (${putRes.status})`);
    }

    // Step 3 — process via chat ingestion pipeline
    const processRes = await fetch(`${API_URL}/imports/process-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ platform, storagePath, ...opts }),
    });
    const processJson = await processRes.json();
    if (!processRes.ok || !processJson.success) {
      throw new Error(processJson.error || `Processing failed (${processRes.status})`);
    }

    return processJson as ChatImportResult;
  },

  /**
   * List all past imports for the current user.
   */
  listImports: async (): Promise<DataImport[]> => {
    const response = await fetch(`${API_URL}/imports`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || 'Failed to load import history');
    }
    return json.data ?? [];
  },
};
