// TwinMe API base URL — local backend for all calls except OAuth
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3004/api';

// OAuth API URL — always uses production (requires HTTPS for Google OAuth)
export const OAUTH_API_URL = process.env.EXPO_PUBLIC_OAUTH_API_URL ?? 'https://www.twinme.me/api';

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'twinme_auth_token',
  AUTH_REFRESH_TOKEN: 'twinme_auth_refresh_token',
  USER: 'twinme_user',
  LAST_SYNC: 'twinme_last_sync',
  PERMISSIONS_SHOWN: 'twinme_permissions_shown',
} as const;

// Background task name
export const USAGE_SYNC_TASK = 'USAGE_SYNC_TASK';

// TwinMe brand colors — exact match with web Claura design system
export const COLORS = {
  primary: '#000000',               // Black — primary buttons, accents
  primaryFg: '#fcf6ef',             // Cream — text on primary buttons
  background: '#fcf6ef',            // Warm cream — main background
  card: '#fffbf4',                  // Warm white card (no backdrop blur on Android)
  cardSolid: '#ffffff',
  text: '#000000',                  // Pure black — primary text
  textMuted: '#8A857D',             // Warm gray — secondary text
  border: 'rgba(0,0,0,0.06)',       // Glass border
  inputBorder: '#E8E3DC',           // Input field border
  inputBg: 'rgba(255,255,255,0.6)', // Input background
  success: '#10b981',
  warning: '#C9B99A',
  error: '#ef4444',
} as const;
