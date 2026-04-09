/**
 * TwinMe - Universal Digital Twin
 * Popup UI Logic v3
 */

let userId = null;

const APP_URL = 'https://twin-ai-learn.vercel.app';
const APP_ORIGINS = [APP_URL];

// Guard for chrome extension APIs (graceful degradation outside extension context)
const isExtensionContext = typeof chrome !== 'undefined' && chrome.storage && chrome.runtime;

// DOM refs
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const setupSection = document.getElementById('setup-section');
const connectedSection = document.getElementById('connected-section');
const userIdInput = document.getElementById('user-id-input');
const connectBtn = document.getElementById('connect-btn');
const autoDetectBtn = document.getElementById('auto-detect-btn');
const detectStatus = document.getElementById('detect-status');
const manualFallback = document.getElementById('manual-fallback');
const syncBtn = document.getElementById('sync-btn');
const dashboardBtn = document.getElementById('dashboard-btn');
const settingsBtn = document.getElementById('settings-btn');
const pagesCount = document.getElementById('pages-count');
const todayTime = document.getElementById('today-time');
const unsyncedCount = document.getElementById('unsynced-count');
const domainsSection = document.getElementById('domains-section');
const domainList = document.getElementById('domain-list');
const analyzeBtn = document.getElementById('analyze-btn');
const analyzeResult = document.getElementById('analyze-result');
const importBanner = document.getElementById('import-banner');
const importBtn = document.getElementById('import-btn');
const lastSyncEl = document.getElementById('last-sync');

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

async function initialize() {
  const stored = await chrome.storage.local.get(['userId', 'lastSync', 'historyImported']);

  if (stored.userId) {
    userId = stored.userId;
    showConnectedState();
  } else {
    silentAutoDetect();
  }

  if (stored.lastSync) {
    lastSyncEl.textContent = 'Synced ' + formatTimeAgo(stored.lastSync);
  }

  // Hide import banner if already done
  if (stored.historyImported) {
    importBanner.classList.add('hidden');
  }

  await updateStats();
  setupEventListeners();
}

// ─────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────

function setupEventListeners() {
  connectBtn.addEventListener('click', handleConnect);
  autoDetectBtn.addEventListener('click', autoDetectUser);
  const openAppBtn = document.getElementById('open-app-btn');
  if (openAppBtn) openAppBtn.addEventListener('click', handleOpenApp);

  // Tracking toggle
  const trackingToggle = document.getElementById('tracking-toggle');
  const toggleTrack = document.getElementById('toggle-track');
  const toggleThumb = document.getElementById('toggle-thumb');
  if (trackingToggle && isExtensionContext) {
    // Load saved state
    chrome.storage.local.get(['trackingEnabled'], (result) => {
      const enabled = result.trackingEnabled !== false; // default on
      trackingToggle.checked = enabled;
      updateToggleVisual(enabled);
    });
    trackingToggle.addEventListener('change', () => {
      const enabled = trackingToggle.checked;
      chrome.storage.local.set({ trackingEnabled: enabled });
      chrome.runtime.sendMessage({ type: 'SET_TRACKING', enabled });
      updateToggleVisual(enabled);
    });
  }
  function updateToggleVisual(enabled) {
    if (!toggleTrack || !toggleThumb) return;
    toggleTrack.style.background = enabled ? 'rgba(255,255,255,0.15)' : 'rgba(193,192,182,0.2)';
    toggleThumb.style.background = enabled ? 'rgba(255,255,255,0.85)' : '#86807b';
    toggleThumb.style.left = enabled ? '18px' : '2px';
  }

  analyzeBtn.addEventListener('click', analyzeCurrentPage);

  importBtn.addEventListener('click', async () => {
    importBtn.textContent = 'Importing...';
    importBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'IMPORT_HISTORY' }, async (response) => {
      if (response?.success) {
        importBtn.textContent = `Done (${response.count} pages)`;
        await chrome.storage.local.set({ historyImported: true });
        setTimeout(() => importBanner.classList.add('hidden'), 2000);
        await updateStats();
      } else {
        importBtn.textContent = 'Failed';
        importBtn.disabled = false;
      }
    });
  });

  syncBtn.addEventListener('click', async () => {
    syncBtn.textContent = 'Syncing...';
    syncBtn.classList.add('syncing');
    syncBtn.disabled = true;

    chrome.runtime.sendMessage({ type: 'MANUAL_SYNC' }, async () => {
      await chrome.storage.local.set({ lastSync: new Date().toISOString() });
      lastSyncEl.textContent = 'Synced just now';
      await updateStats();
      syncBtn.textContent = 'Sync Now';
      syncBtn.classList.remove('syncing');
      syncBtn.disabled = false;
    });
  });

  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: APP_URL + '/dashboard' });
  });

  settingsBtn.addEventListener('click', () => {
    // Only toggle in connected mode; in disconnected, open the app
    if (!userId) {
      window.open(APP_URL, '_blank');
      return;
    }
    if (setupSection.classList.contains('hidden')) {
      setupSection.classList.remove('hidden');
      connectedSection.classList.add('hidden');
      settingsBtn.textContent = 'Done';
    } else {
      setupSection.classList.add('hidden');
      connectedSection.classList.remove('hidden');
      settingsBtn.textContent = 'Settings';
    }
  });
}

// ─────────────────────────────────────────────
// Analyze this page
// ─────────────────────────────────────────────

async function analyzeCurrentPage() {
  analyzeBtn.textContent = 'Analyzing...';
  analyzeBtn.disabled = true;
  analyzeResult.classList.add('hidden');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/page-analyzer.js'],
    });

    // Show optimistic result (background will receive the full message)
    analyzeResult.textContent = `Analyzing "${tab.title || tab.url}" — data sent to your TwinMe profile.`;
    analyzeResult.classList.remove('hidden');

    setTimeout(() => analyzeResult.classList.add('hidden'), 4000);
  } catch (err) {
    analyzeResult.textContent = 'Could not analyze this page. Try on a regular web page.';
    analyzeResult.classList.remove('hidden');
    analyzeResult.style.color = '#f87171';
    setTimeout(() => {
      analyzeResult.classList.add('hidden');
      analyzeResult.style.color = '';
    }, 3000);
  }

  analyzeBtn.textContent = 'Analyze This Page';
  analyzeBtn.disabled = false;
}

// ─────────────────────────────────────────────
// Auto-detect logged-in user
// ─────────────────────────────────────────────

async function silentAutoDetect() {
  try {
    const tabs = await chrome.tabs.query({});
    const appTab = tabs.find(t => {
      try { return t.url && new URL(t.url).origin === APP_URL; } catch { return false; }
    });
    if (!appTab) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: appTab.id },
      func: () => {
        const raw = localStorage.getItem('auth_user');
        const token = localStorage.getItem('auth_token');
        if (!raw) return null;
        try {
          const u = JSON.parse(raw);
          return { userId: u.id, name: u.name || u.given_name || u.email, token };
        } catch { return null; }
      },
    });

    const userData = results?.[0]?.result;
    if (userData?.userId) {
      userId = userData.userId;
      chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId }, (r) => {
        if (r?.success) showConnectedState();
      });
      // Also send auth token for API sync
      if (userData.token) {
        chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token: userData.token });
      }
    }
  } catch {
    // Silent fail
  }
}

async function autoDetectUser() {
  autoDetectBtn.textContent = 'Detecting...';
  autoDetectBtn.disabled = true;
  detectStatus.classList.remove('hidden');
  detectStatus.style.color = 'rgba(193,192,182,0.5)';
  detectStatus.textContent = 'Checking TwinMe app...';

  // Hide any previous fallback UI
  const openAppFallback = document.getElementById('open-app-fallback');
  if (openAppFallback) openAppFallback.classList.add('hidden');
  manualFallback.classList.add('hidden');

  try {
    // First: check chrome.storage (content script may have already synced it)
    const stored = await chrome.storage.local.get(['userId', 'auth_token']);
    if (stored.userId) {
      userId = stored.userId;
      detectStatus.textContent = 'Connected as ' + userId.substring(0, 8);
      detectStatus.style.color = '#34d399';
      chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId }, (r) => {
        if (r?.success) setTimeout(() => showConnectedState(), 500);
      });
      autoDetectBtn.textContent = 'Detect My Account';
      autoDetectBtn.disabled = false;
      return;
    }

    const tabs = await chrome.tabs.query({});
    let appTab = tabs.find(t => {
      try { return t.url && new URL(t.url).origin === APP_URL; } catch { return false; }
    });

    // No TwinMe tab open -> show "Open TwinMe" button
    if (!appTab) {
      detectStatus.textContent = 'TwinMe is not open. Please sign in first.';
      detectStatus.style.color = 'rgba(193,192,182,0.6)';
      if (openAppFallback) openAppFallback.classList.remove('hidden');
      autoDetectBtn.textContent = 'Detect My Account';
      autoDetectBtn.disabled = false;
      return;
    }

    // Read auth from the open tab
    const results = await chrome.scripting.executeScript({
      target: { tabId: appTab.id },
      func: () => {
        const raw = localStorage.getItem('auth_user');
        const token = localStorage.getItem('auth_token');
        if (raw) {
          try {
            const u = JSON.parse(raw);
            return { userId: u.id, name: u.name || u.given_name || u.email, email: u.email, token };
          } catch { return null; }
        }
        if (token && token.split('.').length === 3) {
          try {
            const p = JSON.parse(atob(token.split('.')[1]));
            return { userId: p.id || p.userId || p.sub, name: p.name || p.email, email: p.email, token };
          } catch { return null; }
        }
        return null;
      },
    });

    const userData = results?.[0]?.result;
    if (userData?.userId) {
      userId = userData.userId;
      detectStatus.textContent = 'Connected as ' + (userData.name || userData.email || userId.substring(0, 8));
      detectStatus.style.color = '#34d399';

      chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId }, (r) => {
        if (r?.success) setTimeout(() => showConnectedState(), 500);
      });
      if (userData.token) {
        chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token: userData.token });
      }
    } else {
      // Tab exists but not signed in
      detectStatus.textContent = 'Please sign in to TwinMe in the open tab.';
      detectStatus.style.color = 'rgba(239,68,68,0.8)';
      if (openAppFallback) openAppFallback.classList.remove('hidden');
    }
  } catch (err) {
    detectStatus.textContent = 'Could not read TwinMe. Try opening it first.';
    detectStatus.style.color = 'rgba(239,68,68,0.8)';
    if (openAppFallback) openAppFallback.classList.remove('hidden');
    manualFallback.classList.remove('hidden');
  }

  autoDetectBtn.textContent = 'Detect My Account';
  autoDetectBtn.disabled = false;
}

function handleOpenApp() {
  chrome.tabs.create({ url: APP_URL + '/auth', active: true });
  window.close();
}

// ─────────────────────────────────────────────
// Connect manually
// ─────────────────────────────────────────────

function handleConnect() {
  const inputId = userIdInput.value.trim();
  if (!inputId) {
    userIdInput.style.borderColor = 'rgba(239, 68, 68, 0.5)';
    setTimeout(() => { userIdInput.style.borderColor = ''; }, 1500);
    return;
  }

  userId = inputId;
  chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId }, (r) => {
    if (r?.success) {
      showConnectedState();
      setupSection.classList.add('hidden');
      settingsBtn.textContent = 'Settings';
    }
  });
}

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

function showConnectedState() {
  statusBadge.classList.remove('disconnected');
  statusBadge.classList.add('connected');
  statusText.textContent = 'Connected';
  setupSection.classList.add('hidden');
  connectedSection.classList.remove('hidden');
  updateStats();
}

// ─────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────

async function updateStats() {
  const stored = await chrome.storage.local.get(['web_history', 'youtube_history', 'twitch_history']);
  const webHistory = stored.web_history || [];
  const allHistory = [...webHistory, ...(stored.youtube_history || []), ...(stored.twitch_history || [])];

  // Today's pages
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  const todayVisits = webHistory.filter(e => {
    if (e.data_type === 'history_import') return false;
    const t = new Date(e.timestamp || e.collectedAt).getTime();
    return t >= todayTs;
  });

  pagesCount.textContent = todayVisits.length;

  // Today's total browsing time
  const todaySeconds = todayVisits.reduce((sum, e) => sum + (e.duration_seconds || 0), 0);
  const todayMins = Math.round(todaySeconds / 60);
  todayTime.textContent = todayMins >= 60
    ? Math.floor(todayMins / 60) + 'h ' + (todayMins % 60) + 'm'
    : todayMins + 'm';

  // Unsynced count
  const unsynced = allHistory.filter(d => !d.synced).length;
  unsyncedCount.textContent = unsynced;

  // Top 5 domains today by time
  const domainTimes = {};
  todayVisits.forEach(e => {
    const d = e.domain || '';
    if (!d) return;
    domainTimes[d] = (domainTimes[d] || 0) + (e.duration_seconds || 0);
  });

  const sortedDomains = Object.entries(domainTimes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sortedDomains.length > 0) {
    domainsSection.classList.remove('hidden');
    domainList.textContent = '';

    const maxTime = sortedDomains[0][1];
    sortedDomains.forEach(([domain, secs]) => {
      const mins = Math.round(secs / 60);
      const pct = Math.round((secs / maxTime) * 100);
      const row = createDomainRow(domain, mins >= 60
        ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
        : mins + 'm', pct);
      domainList.appendChild(row);
    });
  } else {
    domainsSection.classList.add('hidden');
  }
}

function createDomainRow(domain, timeStr, barPct) {
  const row = document.createElement('div');
  row.className = 'domain-row';

  const name = document.createElement('div');
  name.className = 'domain-name';
  name.textContent = domain;

  const time = document.createElement('div');
  time.className = 'domain-time';
  time.textContent = timeStr;

  const barWrap = document.createElement('div');
  barWrap.className = 'domain-bar-wrap';
  const bar = document.createElement('div');
  bar.className = 'domain-bar';
  bar.style.width = barPct + '%';
  barWrap.appendChild(bar);

  row.appendChild(name);
  row.appendChild(time);
  row.appendChild(barWrap);
  return row;
}

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

// ─────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────

if (isExtensionContext) {
  initialize();
  setInterval(updateStats, 5000);
} else {
  // Outside extension context — show UI without chrome APIs
  setupEventListeners();
}
