/**
 * Exports API Client — GDPR data-export upload pipeline.
 *
 * Talks to /api/exports/* which parses the zip in memory, persists
 * platform_exports.aggregates + writes natural-language observations,
 * then discards the raw zip. Distinct from the older /api/imports/*
 * presigned-Storage flow.
 */

import { API_URL, getAccessToken } from './apiBase';

export type ExportPlatform = 'discord_export' | 'linkedin_export' | 'instagram_export';

export interface ExportRow {
  platform: ExportPlatform;
  status: 'pending' | 'parsing' | 'parsed' | 'failed';
  uploaded_at: string;
  parsed_at: string | null;
  observation_count: number;
  source_filename: string | null;
  error_message: string | null;
}

export interface ExportUploadResult {
  success: boolean;
  platform: ExportPlatform;
  observations_stored: number;
  aggregates: Record<string, unknown>;
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const exportsAPI = {
  list: async (): Promise<ExportRow[]> => {
    const res = await fetch(`${API_URL}/exports`, { headers: authHeaders() });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || `List failed (${res.status})`);
    return json.exports ?? [];
  },

  upload: async (platform: ExportPlatform | null, file: File): Promise<ExportUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const url = platform
      ? `${API_URL}/exports/upload?platform=${encodeURIComponent(platform)}`
      : `${API_URL}/exports/upload`;
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Upload failed (${res.status})`);
    }
    return json as ExportUploadResult;
  },

  remove: async (platform: ExportPlatform): Promise<void> => {
    const res = await fetch(`${API_URL}/exports/${platform}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || `Delete failed (${res.status})`);
  },
};
