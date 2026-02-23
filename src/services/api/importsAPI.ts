/**
 * Imports API Client
 * Handles GDPR / platform data export uploads and import history.
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

export const importsAPI = {
  /**
   * Upload a platform GDPR export file.
   * Uses FormData so the browser sets the correct multipart Content-Type boundary.
   */
  uploadGdpr: async (platform: ImportPlatform, file: File): Promise<GdprImportResult> => {
    const token = getAuthToken();
    const formData = new FormData();
    formData.append('platform', platform);
    formData.append('file', file);

    const response = await fetch(`${API_URL}/imports/gdpr`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      throw new Error(json.error || `Upload failed (${response.status})`);
    }

    return {
      importId: json.importId,
      observationsCreated: json.observationsCreated,
      factsCreated: json.factsCreated,
    };
  },

  /**
   * List all past imports for the current user.
   */
  listImports: async (): Promise<DataImport[]> => {
    const token = getAuthToken();
    const response = await fetch(`${API_URL}/imports`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || 'Failed to load import history');
    }

    return json.data ?? [];
  },
};
