/**
 * Imports API Client
 * Handles GDPR / platform data export uploads and import history.
 *
 * Upload flow (bypasses Vercel 4.5 MB body limit):
 *   1. POST /imports/upload-url  → get a presigned Supabase Storage URL
 *   2. PUT  {signedUrl}          → upload file directly to Supabase Storage
 *   3. POST /imports/process     → backend downloads, parses, and deletes the file
 */

import { API_URL } from './apiBase';

export type ImportPlatform = 'spotify' | 'youtube' | 'discord' | 'reddit';

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
  return localStorage.getItem('auth_token') || localStorage.getItem('token');
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
