/**
 * Soul Signature Browser Extension - Background Service Worker v2
 *
 * Universal browsing tracking uses the Chrome Tabs API only.
 * No content scripts injected on arbitrary pages.
 *
 * Tab tracking approach:
 *   - chrome.tabs.onUpdated (status === 'complete') → records page load
 *   - chrome.tabs.onActivated → starts timing the newly active tab
 *   - chrome.tabs.onRemoved  → closes out timing for closed tabs
 *   - When switching tabs, the time for the previous tab is calculated and stored
 */

import { EXTENSION_CONFIG } from './config.js';

const API_BASE_URL = EXTENSION_CONFIG.API_URL;

// Tab timing state: tabId → { url, title, domain, activatedAt }
const tabTimestamps = {};
let activeTabId = null;

// Tab switching pattern tracking
const tabSwitchLog = [];
const TAB_PATTERN_INTERVAL = 15 * 60 * 1000; // 15 minutes

// In-memory state
let userId = null;
let authToken = null;

// ─────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const { userId: storedUserId, auth_token: storedToken } =
    await chrome.storage.local.get(['userId', 'auth_token']);
  userId = storedUserId || null;
  authToken = storedToken || null;

  chrome.alarms.create('sync-data', { periodInMinutes: 5 });
});

// Restore state on service worker wake-up + ensure alarm exists
chrome.storage.local.get(['userId', 'auth_token']).then(({ userId: id, auth_token: token }) => {
  if (id) userId = id;
  if (token) authToken = token;
});
// Re-create alarm on every wake (survives service worker restarts)
chrome.alarms.get('sync-data', (alarm) => {
  if (!alarm) chrome.alarms.create('sync-data', { periodInMinutes: 5 });
});

// ─────────────────────────────────────────────
// Alarm handler
// ─────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-data') {
    // Flush current active tab so time-on-page is recorded even without tab switching
    flushActiveTab();
    // Re-start timing for the active tab so next flush captures the next interval
    if (activeTabId && tabTimestamps[activeTabId]) {
      tabTimestamps[activeTabId].activatedAt = Date.now();
    }
    await syncCollectedData();
  }
});

// ─────────────────────────────────────────────
// Message handler (from popup + content scripts)
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SET_USER_ID':
      userId = message.userId;
      chrome.storage.local.set({ userId });
      sendResponse({ success: true });
      break;

    case 'SET_AUTH_TOKEN':
      authToken = message.token;
      chrome.storage.local.set({ auth_token: message.token });
      sendResponse({ success: true });
      break;

    case 'GET_STATUS':
      sendResponse({ userId, active: !!userId });
      break;

    case 'NETFLIX_DATA':
      handleNetflixData(message.data);
      sendResponse({ success: true });
      break;

    case 'CAPTURE_YOUTUBE_DATA':
      handleYouTubeData(message.data);
      sendResponse({ success: true });
      break;

    case 'CAPTURE_TWITCH_DATA':
      handleTwitchData(message.data);
      sendResponse({ success: true });
      break;

    case 'SEND_PLATFORM_DATA':
      sendToBackend(message.platform || 'web', message.events || [message.data])
        .then(() => sendResponse({ success: true }));
      return true; // async response

    case 'PAGE_ANALYSIS_RESULT':
      handlePageAnalysis(message.data);
      sendResponse({ success: true });
      break;

    case 'IMPORT_HISTORY':
      importBrowsingHistory().then((count) => sendResponse({ success: true, count }));
      return true; // async response

    case 'SET_TRACKING':
      chrome.storage.local.set({ trackingEnabled: message.enabled });
      // Notify all content scripts
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'SET_TRACKING', enabled: message.enabled }).catch(() => {});
        });
      });
      sendResponse({ success: true });
      break;

    case 'MANUAL_SYNC':
      syncCollectedData().then(() => sendResponse({ success: true }));
      return true;

    case 'WEB_BROWSING_EVENT':
      handleWebBrowsingEvent(message.data).then(() => sendResponse({ success: true }));
      return true; // async response

    case 'BROWSING_ACTIVITY':
      // Store browsing activity from soul-observer (scroll, clicks, page_load, etc.)
      handleBrowsingActivity(message.data).then(() => sendResponse({ success: true }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  return false;
});

// ─────────────────────────────────────────────
// Tab tracking (replaces soul-observer.js)
// ─────────────────────────────────────────────

const SKIP_SCHEMES = ['chrome://', 'chrome-extension://', 'about:', 'moz-extension://', 'brave://'];
const SENSITIVE_DOMAINS = [
  'accounts.google.com', 'login.', 'signin.',
  'chase.com', 'wellsfargo.com', 'capitalone.com', 'citi.com',
  'paypal.com', 'venmo.com',
  'mail.google.com', 'outlook.live.com', 'mail.yahoo.com',
  '1password.com', 'lastpass.com', 'bitwarden.com',
];

function shouldSkip(url) {
  if (!url) return true;
  if (SKIP_SCHEMES.some(s => url.startsWith(s))) return true;
  try {
    const hostname = new URL(url).hostname;
    return SENSITIVE_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return true;
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Record a completed tab visit with duration in seconds */
async function recordTabVisit(url, title, durationSeconds) {
  if (shouldSkip(url)) return;
  if (durationSeconds < 2) return; // ignore flashes / instant navigations

  const domain = extractDomain(url);
  const event = {
    data_type: 'tab_visit',
    platform: 'web',
    url,
    title: title || domain,
    domain,
    duration_seconds: Math.round(durationSeconds),
    timestamp: new Date().toISOString(),
    synced: false,
  };

  const { web_history = [] } = await chrome.storage.local.get('web_history');
  const trimmed = [...web_history, event].slice(-1000); // keep last 1000
  await chrome.storage.local.set({ web_history: trimmed });

  await sendToBackend('web', [event]);
  updateBadge();
}

/** Flush timing for the currently active tab (called before switching) */
function flushActiveTab() {
  if (!activeTabId || !tabTimestamps[activeTabId]) return;
  const info = tabTimestamps[activeTabId];
  if (!info.activatedAt) return;
  const duration = (Date.now() - info.activatedAt) / 1000;
  recordTabVisit(info.url, info.title, duration);
  info.activatedAt = null; // prevent double-flush
}

// Tab finishes loading → update stored URL/title
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (shouldSkip(tab.url)) return;

  if (!tabTimestamps[tabId]) {
    tabTimestamps[tabId] = { url: tab.url, title: tab.title, domain: extractDomain(tab.url), activatedAt: null };
  } else {
    // URL changed while tab was active — flush old, start new timing
    if (tabId === activeTabId && tabTimestamps[tabId].activatedAt) {
      const duration = (Date.now() - tabTimestamps[tabId].activatedAt) / 1000;
      recordTabVisit(tabTimestamps[tabId].url, tabTimestamps[tabId].title, duration);
    }
    tabTimestamps[tabId].url = tab.url;
    tabTimestamps[tabId].title = tab.title;
    tabTimestamps[tabId].domain = extractDomain(tab.url);
    if (tabId === activeTabId) {
      tabTimestamps[tabId].activatedAt = Date.now();
    }
  }
});

// Tab is focused by user
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // Flush previous tab
  flushActiveTab();

  // Log tab switch for pattern tracking
  if (activeTabId && tabTimestamps[activeTabId]) {
    const fromInfo = tabTimestamps[activeTabId];
    tabSwitchLog.push({
      fromDomain: fromInfo.domain,
      toDomain: '', // filled after we get new tab info
      timestamp: Date.now()
    });
    if (tabSwitchLog.length > 500) tabSwitchLog.splice(0, tabSwitchLog.length - 500);
  }

  activeTabId = activeInfo.tabId;

  // Get the tab details
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (shouldSkip(tab.url)) return;

    tabTimestamps[activeInfo.tabId] = {
      url: tab.url,
      title: tab.title,
      domain: extractDomain(tab.url),
      activatedAt: Date.now(),
    };
  } catch {
    // Tab may have closed immediately
  }
});

// Tab is closed — flush its timing
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    flushActiveTab();
    activeTabId = null;
  }
  delete tabTimestamps[tabId];
});

// Periodic tab pattern aggregation (every 15 minutes)
setInterval(async () => {
  if (tabSwitchLog.length < 3 || !userId) return;

  const now = Date.now();
  const recentSwitches = tabSwitchLog.filter(s => now - s.timestamp < TAB_PATTERN_INTERVAL);
  if (recentSwitches.length < 3) return;

  const domainCounts = {};
  recentSwitches.forEach(s => {
    if (s.fromDomain) domainCounts[s.fromDomain] = (domainCounts[s.fromDomain] || 0) + 1;
  });
  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d);

  const patternEvent = {
    data_type: 'tab_pattern',
    platform: 'web',
    switchCount: recentSwitches.length,
    uniqueDomains: new Set(recentSwitches.map(s => s.fromDomain).filter(Boolean)).size,
    topDomains,
    periodMinutes: 15,
    timestamp: new Date().toISOString(),
    synced: false,
  };

  await sendToBackend('web', [patternEvent]);

  // Clear processed switches
  tabSwitchLog.length = 0;
}, TAB_PATTERN_INTERVAL);

// ─────────────────────────────────────────────
// History import (one-time bootstrap)
// ─────────────────────────────────────────────

async function importBrowsingHistory() {
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const items = await chrome.history.search({
    text: '',
    startTime: sevenDaysAgo,
    maxResults: 500,
  });

  const events = items
    .filter(item => !shouldSkip(item.url))
    .map(item => ({
      data_type: 'history_import',
      platform: 'web',
      url: item.url,
      title: item.title || extractDomain(item.url),
      domain: extractDomain(item.url),
      visit_count: item.visitCount || 1,
      last_visit: new Date(item.lastVisitTime).toISOString(),
      timestamp: new Date(item.lastVisitTime).toISOString(),
      synced: false,
    }));

  if (events.length > 0) {
    const { web_history = [] } = await chrome.storage.local.get('web_history');
    const combined = [...web_history, ...events].slice(-2000);
    await chrome.storage.local.set({ web_history: combined });
    await sendToBackend('web', events);
  }

  return events.length;
}

// ─────────────────────────────────────────────
// Platform-specific data handlers
// ─────────────────────────────────────────────

async function handleNetflixData(data) {
  const event = { ...data, platform: 'netflix', collectedAt: new Date().toISOString(), synced: false };
  const { netflixData = [] } = await chrome.storage.local.get('netflixData');
  const trimmed = [...netflixData, event].slice(-500);
  await chrome.storage.local.set({ netflixData: trimmed });
  await sendToBackend('netflix', [event]);
  updateBadge();
}

async function handleYouTubeData(data) {
  const { youtube_history = [] } = await chrome.storage.local.get('youtube_history');
  const newEvents = (data.events || []).map(e => ({
    ...e, platform: 'youtube', collectedAt: new Date().toISOString(), synced: false,
  }));
  const trimmed = [...youtube_history, ...newEvents].slice(-500);
  await chrome.storage.local.set({ youtube_history: trimmed });
  await sendToBackend('youtube', newEvents);
  updateBadge();
}

async function handleTwitchData(data) {
  const { twitch_history = [] } = await chrome.storage.local.get('twitch_history');
  const newEvents = (data.events || []).map(e => ({
    ...e, platform: 'twitch', collectedAt: new Date().toISOString(), synced: false,
  }));
  const trimmed = [...twitch_history, ...newEvents].slice(-500);
  await chrome.storage.local.set({ twitch_history: trimmed });
  await sendToBackend('twitch', newEvents);
  updateBadge();
}

async function handlePageAnalysis(data) {
  const event = {
    data_type: 'page_analysis',
    platform: 'web',
    ...data,
    collectedAt: new Date().toISOString(),
    synced: false,
  };
  const { web_history = [] } = await chrome.storage.local.get('web_history');
  const trimmed = [...web_history, event].slice(-1000);
  await chrome.storage.local.set({ web_history: trimmed });
  await sendToBackend('web', [event]);
  updateBadge();
}

async function handleWebBrowsingEvent(data) {
  const events = data?.events || [];
  if (events.length === 0) return;

  // Store in web_history
  const { web_history = [] } = await chrome.storage.local.get('web_history');
  const newEvents = events.map(e => ({
    ...e,
    platform: 'web',
    data_type: e.eventType || 'page_visit',
    collectedAt: new Date().toISOString(),
    synced: false,
  }));
  const trimmed = [...web_history, ...newEvents].slice(-1000);
  await chrome.storage.local.set({ web_history: trimmed });

  // Send to backend
  await sendToBackend('web', newEvents);
  updateBadge();
}

async function handleBrowsingActivity(data) {
  // Only forward significant activities (page_summary, reading_completion, reading_analysis)
  const significantTypes = ['page_summary', 'reading_completion', 'reading_analysis', 'page_load'];
  if (!data || !significantTypes.includes(data.type)) return;

  const event = {
    ...data,
    platform: 'web',
    data_type: data.type === 'page_load' ? 'page_visit' : data.type,
    collectedAt: new Date().toISOString(),
    synced: false,
  };
  const { web_history = [] } = await chrome.storage.local.get('web_history');
  const trimmed = [...web_history, event].slice(-1000);
  await chrome.storage.local.set({ web_history: trimmed });

  await sendToBackend('web', [event]);
  updateBadge();
}

// ─────────────────────────────────────────────
// Backend sync
// ─────────────────────────────────────────────

async function sendToBackend(platform, events) {
  if (!userId || !events || events.length === 0) return;

  const token = authToken || userId;
  try {
    const response = await fetch(`${API_BASE_URL}/extension/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ platform, events }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Background] Sent ${result.inserted} ${platform} events`);
    } else {
      console.error(`[Background] Backend rejected ${platform} events:`, response.status);
    }
  } catch (error) {
    console.error(`[Background] Failed to send ${platform} events:`, error.message);
  }
}

async function syncCollectedData() {
  if (!userId) return;

  const stores = ['youtube_history', 'twitch_history', 'web_history', 'netflixData'];
  const stored = await chrome.storage.local.get(stores);
  const youtube_history = stored.youtube_history || [];
  const twitch_history = stored.twitch_history || [];
  const web_history = stored.web_history || [];
  const netflixData = stored.netflixData || [];

  const batches = [
    { key: 'youtube_history', list: youtube_history, platform: 'youtube' },
    { key: 'twitch_history', list: twitch_history, platform: 'twitch' },
    { key: 'web_history', list: web_history, platform: 'web' },
    { key: 'netflixData', list: netflixData, platform: 'netflix' },
  ];

  let totalSynced = 0;
  for (const { key, list, platform } of batches) {
    const unsynced = list.filter(d => !d.synced);
    if (unsynced.length === 0) continue;

    try {
      await sendToBackend(platform, unsynced);
      // Mark events as synced in the stored array
      for (const item of list) {
        if (!item.synced) item.synced = true;
      }
      await chrome.storage.local.set({ [key]: list });
      totalSynced += unsynced.length;
    } catch (err) {
      console.error(`[Background] Sync failed for ${platform}:`, err.message);
    }
  }

  if (totalSynced > 0) {
    await chrome.storage.local.set({ lastSync: new Date().toISOString() });
  }

  updateBadge();
}

// ─────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────

async function updateBadge() {
  const { web_history = [], youtube_history = [], twitch_history = [], netflixData = [] } =
    await chrome.storage.local.get(['web_history', 'youtube_history', 'twitch_history', 'netflixData']);

  const unsynced = [web_history, youtube_history, twitch_history, netflixData]
    .flat()
    .filter(d => !d.synced).length;

  if (unsynced > 0) {
    chrome.action.setBadgeText({ text: String(unsynced) });
    chrome.action.setBadgeBackgroundColor({ color: '#D97706' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}
