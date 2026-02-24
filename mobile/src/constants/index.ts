// TwinMe API base URL — update for production
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3004/api';

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'twinme_auth_token',
  USER: 'twinme_user',
  LAST_SYNC: 'twinme_last_sync',
} as const;

// Background task name
export const USAGE_SYNC_TASK = 'USAGE_SYNC_TASK';

// TwinMe brand colors
export const COLORS = {
  primary: '#8b5cf6',
  primaryLight: 'rgba(139,92,246,0.12)',
  background: '#faf9f8',
  card: '#ffffff',
  text: '#1a1a1a',
  textMuted: '#8A857D',
  border: 'rgba(0,0,0,0.08)',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
} as const;
