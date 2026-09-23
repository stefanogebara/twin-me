/**
 * GDPR parser: Android Usage.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

// ---------------------------------------------------------------------------
// Android Usage parser
// ---------------------------------------------------------------------------

/**
 * Input: JSON object from mobile app
 * { apps: [{ packageName, appName, totalTimeMs, date }], notifications: [{ packageName, appName, count, date }] }
 */
function parseAndroidUsage(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('android_usage file is not valid JSON');
  }

  const apps = Array.isArray(data.appUsage) ? data.appUsage : (Array.isArray(data.apps) ? data.apps : []);
  const notifications = Array.isArray(data.notificationPatterns) ? data.notificationPatterns : (Array.isArray(data.notifications) ? data.notifications : []);
  const launches = Array.isArray(data.appLaunchCounts) ? data.appLaunchCounts : [];
  const hourly = Array.isArray(data.hourlyActivity) ? data.hourlyActivity : [];
  const observations = [];

  // ── Screen-on time ────────────────────────────────────────────────────────
  const screenOnMs = typeof data.screenOnTimeMs === 'number' ? data.screenOnTimeMs : 0;
  if (screenOnMs > 0) {
    const screenHours = (screenOnMs / 3_600_000).toFixed(1);
    observations.push(`Android screen-on time in last 24h: ${screenHours} hours`);
  }

  // ── Screen unlocks ────────────────────────────────────────────────────────
  const unlocks = typeof data.screenUnlockCount === 'number' ? data.screenUnlockCount : 0;
  if (unlocks > 0) {
    const avgMinsPerUnlock = screenOnMs > 0 ? Math.round(screenOnMs / unlocks / 60000) : null;
    const detail = avgMinsPerUnlock ? ` (~${avgMinsPerUnlock}min avg per session)` : '';
    observations.push(`Unlocked phone ${unlocks} times today${detail}`);
  }

  // ── Top apps by time ──────────────────────────────────────────────────────
  const appTotals = {};
  for (const entry of apps) {
    const key = entry.appName || entry.packageName || 'Unknown';
    appTotals[key] = (appTotals[key] || 0) + (entry.totalTimeMs || 0);
  }
  const topApps = Object.entries(appTotals).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 10);

  if (topApps.length > 0) {
    observations.push(`Most-used apps on Android: ${topApps.slice(0, 5).map(([n]) => n).join(', ')}`);
    for (const [appName, timeMs] of topApps.slice(0, 3)) {
      const mins = Math.round(Number(timeMs) / 60_000);
      if (mins >= 5) {
        const label = mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}min`;
        observations.push(`Used ${appName} for ${label} on Android`);
      }
    }
  }

  // ── Launch counts — detect quick-check behaviour ──────────────────────────
  const checkers = launches
    .filter(e => e.launchCount >= 10 && e.avgSessionMs > 0 && e.avgSessionMs < 3 * 60_000)
    .sort((a, b) => b.launchCount - a.launchCount)
    .slice(0, 3);
  if (checkers.length > 0) {
    const names = checkers.map(e => `${e.appName} (${e.launchCount}x)`).join(', ');
    observations.push(`Quick-check habit on Android (many short opens): ${names}`);
  }

  const topLaunch = [...launches].sort((a, b) => b.launchCount - a.launchCount)[0];
  if (topLaunch && topLaunch.launchCount >= 5) {
    const avgSec = Math.round(topLaunch.avgSessionMs / 1000);
    const avgLabel = avgSec >= 60 ? `${Math.round(avgSec / 60)}min avg` : `${avgSec}s avg`;
    observations.push(`Most opened app on Android: ${topLaunch.appName} (${topLaunch.launchCount} times, ${avgLabel} per session)`);
  }

  // ── Hourly activity — peak window + night owl / morning signal ────────────
  if (hourly.length > 0) {
    const peak = [...hourly].sort((a, b) => Number(b.totalMs) - Number(a.totalMs))[0];
    if (peak && Number(peak.totalMs) > 5 * 60_000) {
      const fmt = (h) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
      observations.push(`Peak Android usage hour: ${fmt(peak.hour)} (${peak.activeApps} apps active)`);
    }
    const nightMs = hourly.filter(h => h.hour >= 22 || h.hour <= 4).reduce((s, h) => s + Number(h.totalMs), 0);
    const morningMs = hourly.filter(h => h.hour >= 6 && h.hour <= 9).reduce((s, h) => s + Number(h.totalMs), 0);
    const totalMs = hourly.reduce((s, h) => s + Number(h.totalMs), 0);
    if (totalMs > 0) {
      const nightPct = nightMs / totalMs;
      const morningPct = morningMs / totalMs;
      if (nightPct > 0.3) observations.push(`Night-owl phone usage pattern (${Math.round(nightPct * 100)}% of activity after 10pm)`);
      else if (morningPct > 0.25) observations.push(`Morning phone user (${Math.round(morningPct * 100)}% of activity before 9am)`);
    }
  }

  // ── App categories ────────────────────────────────────────────────────────
  const socialPkgs = ['instagram', 'twitter', 'snapchat', 'tiktok', 'facebook', 'reddit', 'discord', 'telegram', 'whatsapp'];
  const productivityPkgs = ['notion', 'slack', 'gmail', 'calendar', 'docs', 'sheets', 'zoom', 'teams', 'meet'];
  const entertainmentPkgs = ['youtube', 'netflix', 'spotify', 'twitch', 'prime', 'hulu', 'music'];
  const keys = Object.keys(appTotals).map(k => k.toLowerCase());
  const socialCount = keys.filter(k => socialPkgs.some(p => k.includes(p))).length;
  const prodCount = keys.filter(k => productivityPkgs.some(p => k.includes(p))).length;
  const entCount = keys.filter(k => entertainmentPkgs.some(p => k.includes(p))).length;
  if (socialCount >= 2) observations.push(`Active social media user on Android (${socialCount} social apps tracked)`);
  if (prodCount >= 2) observations.push(`Uses productivity apps on Android (${prodCount} tracked)`);
  if (entCount >= 2) observations.push(`Regular entertainment app usage on Android (${entCount} apps)`);

  // ── Notification patterns ─────────────────────────────────────────────────
  const notifTotals = {};
  for (const entry of notifications) {
    const key = entry.appName || entry.packageName || 'Unknown';
    notifTotals[key] = (notifTotals[key] || 0) + (entry.count || 0);
  }
  const topNotif = Object.entries(notifTotals).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3);
  if (topNotif.length > 0) {
    observations.push(`Most notifications on Android from: ${topNotif.map(([n]) => n).join(', ')}`);
  }

  // ── Battery & charging ────────────────────────────────────────────────────
  const battery = data.batteryInfo;
  if (battery && typeof battery.level === 'number' && battery.level >= 0) {
    if (battery.isCharging) {
      observations.push(`Phone charging via ${battery.chargingType} at ${battery.level}% battery`);
    } else if (battery.level <= 20) {
      observations.push(`Phone battery very low (${battery.level}%) — not charging`);
    }
  }

  // ── Audio / ringer mode ───────────────────────────────────────────────────
  if (data.audioMode === 'silent') {
    observations.push(`Phone kept on silent — prioritises uninterrupted focus`);
  } else if (data.audioMode === 'vibrate') {
    observations.push(`Phone on vibrate — stays reachable without disrupting focus`);
  }

  return observations;
}

export { parseAndroidUsage };
