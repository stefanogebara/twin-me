export interface User {
  id: string;
  email: string;
  name?: string;
  full_name?: string;
  created_at?: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
}

export interface MemoryStats {
  total: number;
  byPlatform: Record<string, number>;
  lastMemoryAt: string | null;
}

export interface TwinInsight {
  id: string;
  content: string;
  category: string;
  created_at: string;
  importance_score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AppUsageEntry {
  appName: string;
  packageName: string;
  totalTimeMs: number;
  lastUsed: number;
  category?: string;
}

export interface NotificationEntry {
  packageName: string;
  appName: string;
  count: number;
  hour: number;
}

export interface AndroidUsageData {
  capturedAt: string;
  appUsage: AppUsageEntry[];
  notificationPatterns: NotificationEntry[];
  screenOnTimeMs: number;
}
