import type { AndroidUsageData, AppUsageEntry, NotificationEntry } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActivityInsights {
  screenTimeH: number;
  socialTimeH: number;
  productiveTimeH: number;
  entertainmentTimeH: number;
  communicationTimeH: number;
  topApps: Array<{ name: string; timeH: number; category: string }>;
  peakHour: number;
  focusSessions: number;
  screenUnlocksPerHour: number;
  morningApps: string[];
  lateNightUsage: boolean;
  mostNotifiedApp: string | null;
  totalNotifications: number;
  digitalWellnessScore: number;
  insights: string[];
}

// ── App category mapping ──────────────────────────────────────────────────────

const PACKAGE_TO_CATEGORY: Record<string, string> = {
  // Social
  'com.instagram.android': 'social',
  'com.zhiliaoapp.musically': 'social',
  'com.ss.android.ugc.trill': 'social',
  'com.snapchat.android': 'social',
  'com.facebook.katana': 'social',
  'com.facebook.lite': 'social',
  'com.twitter.android': 'social',
  'com.twitter.android.lite': 'social',
  'com.x.android': 'social',
  'com.reddit.frontpage': 'social',
  // Communication
  'com.whatsapp': 'communication',
  'com.whatsapp.w4b': 'communication',
  'org.telegram.messenger': 'communication',
  'com.discord': 'communication',
  'com.Slack': 'communication',
  'com.slack': 'communication',
  'com.google.android.gm': 'communication',
  'com.google.android.apps.messaging': 'communication',
  'com.samsung.android.messaging': 'communication',
  'org.thoughtcrime.securesms': 'communication',
  // Entertainment
  'com.google.android.youtube': 'entertainment',
  'com.netflix.mediaclient': 'entertainment',
  'com.spotify.music': 'entertainment',
  'tv.twitch.android.app': 'entertainment',
  'com.amazon.avod.thirdpartyclient': 'entertainment',
  'com.disney.disneyplus': 'entertainment',
  'com.hbo.hbonow': 'entertainment',
  'com.apple.android.music': 'entertainment',
  'com.soundcloud.android': 'entertainment',
  // Productivity
  'com.google.android.apps.docs': 'productivity',
  'com.notion.id': 'productivity',
  'com.google.android.calendar': 'productivity',
  'com.todoist': 'productivity',
  'com.microsoft.teams': 'productivity',
  'com.microsoft.office.word': 'productivity',
  'com.microsoft.office.excel': 'productivity',
  'com.linear': 'productivity',
  'com.atlassian.android.jira.core': 'productivity',
  'com.trello': 'productivity',
  'com.google.android.keep': 'productivity',
  'com.evernote': 'productivity',
  // Health
  'com.whoop.android': 'health',
  'com.garmin.android.apps.connectmobile': 'health',
  'com.fitbit.FitbitMobile': 'health',
  'com.google.android.apps.fitness': 'health',
  'com.samsung.android.app.shealth': 'health',
  'com.apple.android.health': 'health',
  // Browser
  'com.android.chrome': 'browser',
  'org.mozilla.firefox': 'browser',
  'com.brave.browser': 'browser',
  'com.opera.browser': 'browser',
  'com.microsoft.emmx': 'browser',
  'com.duckduckgo.mobile.android': 'browser',
};

const GAMING_KEYWORDS = ['game', 'games', 'gaming', 'clash', 'legends', 'pokemon', 'pubg', 'fortnite', 'roblox', 'minecraft'];

function classifyApp(entry: AppUsageEntry): string {
  // Use the app's own category if already annotated
  if (entry.category) return entry.category;

  // Exact package name match
  const pkgCategory = PACKAGE_TO_CATEGORY[entry.packageName.toLowerCase()];
  if (pkgCategory) return pkgCategory;

  // Substring match for known package prefixes
  const pkg = entry.packageName.toLowerCase();
  const name = entry.appName.toLowerCase();

  if (pkg.includes('instagram') || pkg.includes('tiktok') || pkg.includes('snapchat') || pkg.includes('twitter') || pkg.includes('.x.')) {
    return 'social';
  }
  if (pkg.includes('whatsapp') || pkg.includes('telegram') || pkg.includes('discord') || pkg.includes('slack') || pkg.includes('.gm') || pkg.includes('messaging')) {
    return 'communication';
  }
  if (pkg.includes('youtube') || pkg.includes('netflix') || pkg.includes('spotify') || pkg.includes('twitch') || pkg.includes('prime') || pkg.includes('hbo')) {
    return 'entertainment';
  }
  if (pkg.includes('calendar') || pkg.includes('notion') || pkg.includes('todoist') || pkg.includes('teams') || pkg.includes('.docs') || pkg.includes('.keep')) {
    return 'productivity';
  }
  if (pkg.includes('fitness') || pkg.includes('health') || pkg.includes('whoop') || pkg.includes('garmin') || pkg.includes('fitbit')) {
    return 'health';
  }
  if (pkg.includes('chrome') || pkg.includes('firefox') || pkg.includes('browser') || pkg.includes('brave')) {
    return 'browser';
  }

  // Gaming heuristic — check both package name and app name
  for (const keyword of GAMING_KEYWORDS) {
    if (pkg.includes(keyword) || name.includes(keyword)) return 'gaming';
  }

  return 'other';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function msToH(ms: number): number {
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

// ── Focus session detection ───────────────────────────────────────────────────
// A focus session = 20+ continuous minutes in one app without switching.
// We approximate from AppLaunchEntry: if avgSessionMs >= 20 min, each such
// launch counts as one focus session.
const FOCUS_SESSION_MS = 20 * 60_000;

function countFocusSessions(data: AndroidUsageData): number {
  return data.appLaunchCounts.reduce((acc, entry) => {
    if (entry.avgSessionMs >= FOCUS_SESSION_MS) {
      return acc + entry.launchCount;
    }
    return acc;
  }, 0);
}

// ── Morning apps (06:00–09:00) ────────────────────────────────────────────────

function getMorningApps(data: AndroidUsageData): string[] {
  const MORNING_START = 6;
  const MORNING_END = 9;

  // Sum usage per package across morning hours from hourlyActivity — but
  // hourlyActivity only gives totals, not per-app. Fall back to appUsage
  // lastUsed timestamps to find apps opened in morning hours.
  const morningMs: Record<string, number> = {};

  for (const entry of data.appUsage) {
    const lastUsedDate = new Date(entry.lastUsed);
    const hour = lastUsedDate.getHours();
    if (hour >= MORNING_START && hour < MORNING_END) {
      morningMs[entry.appName] = (morningMs[entry.appName] ?? 0) + entry.totalTimeMs;
    }
  }

  return Object.entries(morningMs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name]) => name);
}

// ── Late-night usage (23:00–05:00) ────────────────────────────────────────────

const LATE_NIGHT_THRESHOLD_MS = 10 * 60_000; // 10 min is "significant"

function hasLateNightUsage(data: AndroidUsageData): boolean {
  const lateMs = data.hourlyActivity
    .filter(h => h.hour >= 23 || h.hour < 5)
    .reduce((acc, h) => acc + h.totalMs, 0);
  return lateMs >= LATE_NIGHT_THRESHOLD_MS;
}

// ── Peak hour ─────────────────────────────────────────────────────────────────

function getPeakHour(data: AndroidUsageData): number {
  if (data.hourlyActivity.length === 0) return 12;
  return data.hourlyActivity.reduce(
    (best, h) => (h.totalMs > best.totalMs ? h : best),
    data.hourlyActivity[0],
  ).hour;
}

// ── Notification aggregation ──────────────────────────────────────────────────

function aggregateNotifications(patterns: NotificationEntry[]): {
  totalNotifications: number;
  mostNotifiedApp: string | null;
} {
  const byApp: Record<string, number> = {};
  let total = 0;

  for (const entry of patterns) {
    byApp[entry.appName] = (byApp[entry.appName] ?? 0) + entry.count;
    total += entry.count;
  }

  const mostNotifiedApp = Object.entries(byApp).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
  return { totalNotifications: total, mostNotifiedApp };
}

// ── Wellness score ────────────────────────────────────────────────────────────

function calcWellnessScore(params: {
  screenTimeH: number;
  focusSessions: number;
  lateNightUsage: boolean;
  screenUnlocksPerHour: number;
  socialTimeH: number;
}): number {
  let score = 70;

  // Penalise excessive screen time (>4h)
  const excessHours = Math.max(0, params.screenTimeH - 4);
  score -= excessHours * 5;

  // Reward focus sessions
  if (params.focusSessions >= 1) score += 5;

  // Penalise late-night use
  if (params.lateNightUsage) score -= 10;

  // Penalise phone fragmentation
  if (params.screenUnlocksPerHour > 60) score -= 3;

  // Penalise excess social media (>1h)
  const excessSocial = Math.max(0, params.socialTimeH - 1);
  score -= excessSocial * 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Insight string generation ─────────────────────────────────────────────────

function buildInsights(insights: ActivityInsights): string[] {
  const lines: string[] = [];

  lines.push(`You spent ${insights.screenTimeH}h on your phone today`);

  if (insights.socialTimeH >= 1) {
    lines.push(`You spend ${insights.socialTimeH}h daily on social media`);
  }

  if (insights.focusSessions > 0) {
    const avgFocusMin = insights.screenTimeH > 0
      ? Math.round((insights.screenTimeH * 60) / insights.focusSessions)
      : 20;
    lines.push(`You had ${insights.focusSessions} deep focus session${insights.focusSessions > 1 ? 's' : ''} today (avg ${avgFocusMin} min each)`);
  }

  if (insights.totalNotifications > 0 && insights.mostNotifiedApp) {
    lines.push(`You received ${insights.totalNotifications} notifications, mostly from ${insights.mostNotifiedApp}`);
  }

  lines.push(`Your peak phone time is ${formatHour(insights.peakHour)}–${formatHour((insights.peakHour + 1) % 24)}`);

  if (insights.lateNightUsage) {
    lines.push('You use your phone late at night regularly');
  }

  // Wellness summary
  const score = insights.digitalWellnessScore;
  if (score >= 80) {
    lines.push('Your digital habits look healthy today');
  } else if (score >= 60) {
    lines.push('Your screen time is moderate — a few more focused sessions could help');
  } else {
    lines.push('Your screen time is high — consider setting app limits');
  }

  // Keep 3–5 most interesting insights
  return lines.slice(0, 5);
}

// ── Main export ───────────────────────────────────────────────────────────────

export function analyzeActivity(data: AndroidUsageData): ActivityInsights {
  // Categorise all apps and sum up time per category
  const categoryMs: Record<string, number> = {};
  const categorisedApps: Array<{ name: string; timeH: number; category: string }> = [];

  for (const entry of data.appUsage) {
    const category = classifyApp(entry);
    categoryMs[category] = (categoryMs[category] ?? 0) + entry.totalTimeMs;
    categorisedApps.push({
      name: entry.appName,
      timeH: msToH(entry.totalTimeMs),
      category,
    });
  }

  const screenTimeH = msToH(data.screenOnTimeMs);
  const socialTimeH = msToH(categoryMs['social'] ?? 0);
  const productiveTimeH = msToH(categoryMs['productivity'] ?? 0);
  const entertainmentTimeH = msToH(categoryMs['entertainment'] ?? 0);
  const communicationTimeH = msToH(categoryMs['communication'] ?? 0);

  const topApps = [...categorisedApps]
    .sort((a, b) => b.timeH - a.timeH)
    .slice(0, 5);

  const peakHour = getPeakHour(data);
  const focusSessions = countFocusSessions(data);
  const screenUnlocksPerHour = screenTimeH > 0
    ? Math.round(data.screenUnlockCount / screenTimeH)
    : 0;
  const morningApps = getMorningApps(data);
  const lateNightUsage = hasLateNightUsage(data);
  const { totalNotifications, mostNotifiedApp } = aggregateNotifications(data.notificationPatterns);

  const digitalWellnessScore = calcWellnessScore({
    screenTimeH,
    focusSessions,
    lateNightUsage,
    screenUnlocksPerHour,
    socialTimeH,
  });

  const partial: ActivityInsights = {
    screenTimeH,
    socialTimeH,
    productiveTimeH,
    entertainmentTimeH,
    communicationTimeH,
    topApps,
    peakHour,
    focusSessions,
    screenUnlocksPerHour,
    morningApps,
    lateNightUsage,
    mostNotifiedApp,
    totalNotifications,
    digitalWellnessScore,
    insights: [],
  };

  return {
    ...partial,
    insights: buildInsights(partial),
  };
}
