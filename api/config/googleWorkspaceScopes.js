/**
 * Google Workspace OAuth Scopes — Centralized Configuration
 * Matching Dimension.dev's scope set for full Workspace read+write.
 *
 * RESTRICTED scopes (require CASA Tier 2 annual certification):
 *   - gmail.modify
 *   - drive
 *
 * SENSITIVE scopes (require Google app verification):
 *   - calendar, calendar.events
 *   - documents, spreadsheets, presentations
 *   - contacts.readonly
 */
export const GOOGLE_WORKSPACE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  // Gmail — read, compose, send, label, archive (RESTRICTED)
  'https://www.googleapis.com/auth/gmail.modify',
  // Drive — full read/write/create/delete (RESTRICTED)
  'https://www.googleapis.com/auth/drive',
  // Calendar — full management (SENSITIVE)
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  // Docs — full read/write (SENSITIVE)
  'https://www.googleapis.com/auth/documents',
  // Sheets — full read/write (SENSITIVE)
  'https://www.googleapis.com/auth/spreadsheets',
  // Slides — full read/write (SENSITIVE)
  'https://www.googleapis.com/auth/presentations',
  // Contacts — read-only (SENSITIVE)
  'https://www.googleapis.com/auth/contacts.readonly',
];

// Subset for read-only access (pre-CASA, no write permissions)
export const GOOGLE_WORKSPACE_SCOPES_READONLY = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
];

// Feature flag: use full scopes or read-only (until CASA is completed)
export const USE_FULL_WORKSPACE_SCOPES = process.env.GOOGLE_WORKSPACE_FULL_SCOPES === 'true';

export function getGoogleWorkspaceScopes() {
  return USE_FULL_WORKSPACE_SCOPES ? GOOGLE_WORKSPACE_SCOPES : GOOGLE_WORKSPACE_SCOPES_READONLY;
}
