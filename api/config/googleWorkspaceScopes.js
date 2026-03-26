/**
 * Google Workspace OAuth Scopes — Centralized Configuration
 * Inspired by Dimension.dev's approach: full read+write without CASA.
 *
 * Strategy: Use SENSITIVE scopes (free verification, 2-5 weeks) instead
 * of RESTRICTED scopes (CASA Tier 2, $900+/yr, annual audit).
 *
 * RESTRICTED (avoided):
 *   - gmail.modify → replaced by gmail.readonly + gmail.send + gmail.compose
 *   - drive (broad) → replaced by drive.file (app-created files only)
 *
 * SENSITIVE (used — require Google app verification):
 *   - gmail.readonly, gmail.send, gmail.compose
 *   - calendar, calendar.events
 *   - drive.file
 *   - documents, spreadsheets, presentations
 *   - contacts.readonly
 */
export const GOOGLE_WORKSPACE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  // Gmail — read + send + compose/draft (all SENSITIVE, no CASA)
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  // Drive — read any file + write app-created files (both SENSITIVE, no CASA)
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
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

// Subset for read-only access (testing mode, no verification needed)
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

// Feature flag: use full scopes (with write) or read-only
export const USE_FULL_WORKSPACE_SCOPES = process.env.GOOGLE_WORKSPACE_FULL_SCOPES === 'true';

export function getGoogleWorkspaceScopes() {
  return USE_FULL_WORKSPACE_SCOPES ? GOOGLE_WORKSPACE_SCOPES : GOOGLE_WORKSPACE_SCOPES_READONLY;
}
