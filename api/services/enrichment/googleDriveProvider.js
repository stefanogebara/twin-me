/**
 * Google Drive Provider — Reads files from user's Google Drive
 *
 * Indexes document titles, metadata, and content excerpts into the memory stream.
 * Uses drive.readonly scope (SENSITIVE, no CASA required).
 *
 * Caps: 50 files per sync, 100KB content per file, last 90 days only.
 */

import { google } from 'googleapis';
import { createLogger } from '../logger.js';

const log = createLogger('GoogleDriveProvider');

const MAX_FILES = 50;
const MAX_CONTENT_BYTES = 100 * 1024; // 100KB
const SYNC_WINDOW_DAYS = 90;

// MIME types we can extract text from
const EXTRACTABLE_TYPES = {
  'application/vnd.google-apps.document': { export: 'text/plain', label: 'Google Doc' },
  'application/vnd.google-apps.spreadsheet': { export: 'text/csv', label: 'Google Sheet' },
  'application/vnd.google-apps.presentation': { export: 'text/plain', label: 'Google Slides' },
  'text/plain': { export: null, label: 'Text file' },
  'text/markdown': { export: null, label: 'Markdown file' },
  'text/csv': { export: null, label: 'CSV file' },
};

/**
 * List recent files from Google Drive.
 * @param {string} accessToken - Valid Google OAuth access token with drive.readonly scope
 * @returns {Promise<Array<{ id, title, mimeType, modifiedTime, label }>>}
 */
export async function listRecentFiles(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  const cutoff = new Date(Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const mimeFilter = Object.keys(EXTRACTABLE_TYPES)
    .map(m => `mimeType='${m}'`)
    .join(' or ');

  try {
    const res = await drive.files.list({
      q: `(${mimeFilter}) and modifiedTime > '${cutoff}' and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime, size, owners)',
      orderBy: 'modifiedTime desc',
      pageSize: MAX_FILES,
    });

    return (res.data.files || []).map(f => ({
      id: f.id,
      title: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      label: EXTRACTABLE_TYPES[f.mimeType]?.label || 'File',
      owner: f.owners?.[0]?.displayName || null,
    }));
  } catch (err) {
    log.error('Failed to list Drive files', { error: err.message });
    return [];
  }
}

/**
 * Get content of a single file (exported as plain text).
 * @param {string} accessToken
 * @param {string} fileId
 * @param {string} mimeType - Original MIME type of the file
 * @returns {Promise<string|null>} Plain text content or null
 */
export async function getFileContent(accessToken, fileId, mimeType) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  try {
    const typeConfig = EXTRACTABLE_TYPES[mimeType];
    if (!typeConfig) return null;

    let content;
    if (typeConfig.export) {
      // Google Workspace files need export
      const res = await drive.files.export({ fileId, mimeType: typeConfig.export }, { responseType: 'text' });
      content = typeof res.data === 'string' ? res.data : String(res.data);
    } else {
      // Regular files — direct download
      const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
      content = typeof res.data === 'string' ? res.data : String(res.data);
    }

    // Cap content size
    if (content && content.length > MAX_CONTENT_BYTES) {
      content = content.slice(0, MAX_CONTENT_BYTES) + '\n[...truncated]';
    }

    return content || null;
  } catch (err) {
    log.warn('Failed to get file content', { fileId, error: err.message });
    return null;
  }
}

/**
 * Full Drive sync — list files and extract content excerpts.
 * Returns observations ready for memory stream ingestion.
 *
 * @param {string} accessToken
 * @param {string} userName - User's display name for observation text
 * @returns {Promise<Array<{ content: string, metadata: object }>>}
 */
export async function syncDriveToObservations(accessToken, userName = 'User') {
  const files = await listRecentFiles(accessToken);
  if (!files.length) {
    log.info('No recent Drive files found');
    return [];
  }

  log.info(`Found ${files.length} Drive files, extracting content...`);
  const observations = [];

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    const contents = await Promise.all(
      batch.map(f => getFileContent(accessToken, f.id, f.mimeType).catch(() => null))
    );

    for (let j = 0; j < batch.length; j++) {
      const file = batch[j];
      const content = contents[j];
      const excerpt = content ? content.slice(0, 500).replace(/\n+/g, ' ').trim() : null;

      // Create natural language observation
      const observation = excerpt
        ? `${userName} has a ${file.label} titled "${file.title}" (last modified ${new Date(file.modifiedTime).toLocaleDateString()}). Content preview: "${excerpt}"`
        : `${userName} has a ${file.label} titled "${file.title}" (last modified ${new Date(file.modifiedTime).toLocaleDateString()}).`;

      observations.push({
        content: observation,
        metadata: {
          source: 'google_drive',
          fileId: file.id,
          fileName: file.title,
          fileType: file.label,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
        },
      });
    }
  }

  log.info(`Generated ${observations.length} Drive observations`);
  return observations;
}
