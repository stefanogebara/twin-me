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

export interface AppLaunchEntry {
  appName: string;
  packageName: string;
  launchCount: number;
  avgSessionMs: number;
}

export interface HourlyActivity {
  hour: number;       // 0-23
  activeApps: number; // unique apps opened this hour
  totalMs: number;    // total foreground time this hour
}

export interface BatteryInfo {
  level: number;      // 0-100, or -1 if unknown
  isCharging: boolean;
  chargingType: 'ac' | 'usb' | 'wireless' | 'none' | 'unknown';
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
  appLaunchCounts: AppLaunchEntry[];
  screenUnlockCount: number;
  hourlyActivity: HourlyActivity[];
  batteryInfo: BatteryInfo;
  audioMode: 'silent' | 'vibrate' | 'normal' | 'unknown';
}
