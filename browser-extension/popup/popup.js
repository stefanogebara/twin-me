/**
 * Twin Me - Digital Life Observer
 * Popup UI Logic matching the main Twin Me platform design
 */

let userId = null;
let observerMode = false;

// App URL - production Twin Me platform
const APP_URL = 'https://twin-ai-learn.vercel.app';
const APP_ORIGINS = [APP_URL];

// DOM elements
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const setupSection = document.getElementById('setup-section');
const connectedSection = document.getElementById('connected-section');
const userIdInput = document.getElementById('user-id-input');
const connectBtn = document.getElementById('connect-btn');
const autoDetectBtn = document.getElementById('auto-detect-btn');
const detectStatus = document.getElementById('detect-status');
const manualFallback = document.getElementById('manual-fallback');
const observerToggle = document.getElementById('observer-toggle');
const privacyNotice = document.getElementById('privacy-notice');
const syncBtn = document.getElementById('sync-btn');
const dashboardBtn = document.getElementById('dashboard-btn');
const settingsBtn = document.getElementById('settings-btn');
const categoriesSection = document.getElementById('categories-section');
const categoriesList = document.getElementById('categories-list');
const activitySection = document.getElementById('activity-section');
const activityList = document.getElementById('activity-list');
const pagesCount = document.getElementById('pages-count');
const searchesCount = document.getElementById('searches-count');
const unsyncedCount = document.getElementById('unsynced-count');
const lastSyncEl = document.getElementById('last-sync');

// Category color mapping (matches platform)
const CATEGORY_COLORS = {
  learning: 'cat-learning',
  social: 'cat-social',
  reference: 'cat-reference',
  news: 'cat-news',
  productivity: 'cat-productivity',
  entertainment: 'cat-entertainment',
  other: 'cat-other'
};

/**
 * Initialize popup
 */
async function initialize() {
  const stored = await chrome.storage.local.get(['userId', 'observerMode', 'lastSync']);

  if (stored.userId) {
    userId = stored.userId;
    if (userIdInput) userIdInput.value = userId;
    showConnectedState();
  } else {
    // Try auto-detecting silently on first open
    silentAutoDetect();
  }

  if (stored.observerMode) {
    observerMode = stored.observerMode;
    observerToggle.classList.add('active');
    privacyNotice.style.display = 'block';
  }

  if (stored.lastSync) {
    lastSyncEl.textContent = 'Synced ' + formatTimeAgo(stored.lastSync);
  }

  updateStats();
  setupEventListeners();
}

/**
 * Format time ago
 */
function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

/**
 * Silent auto-detect on popup open - checks if user is already logged in
 * without creating new tabs or showing UI feedback
 */
async function silentAutoDetect() {
  try {
    const tabs = await chrome.tabs.query({});
    let appTab = null;

    for (const tab of tabs) {
      if (tab.url && APP_ORIGINS.some(origin => tab.url.startsWith(origin))) {
        appTab = tab;
        break;
      }
    }

    if (!appTab) return; // No Twin Me tab open, don't force it

    const results = await chrome.scripting.executeScript({
      target: { tabId: appTab.id },
      func: () => {
        const authUser = localStorage.getItem('auth_user');
        if (authUser) {
          try {
            const user = JSON.parse(authUser);
            return { userId: user.id, name: user.name || user.given_name || user.email };
          } catch (e) { return null; }
        }
        return null;
      }
    });

    const userData = results?.[0]?.result;
    if (userData?.userId) {
      userId = userData.userId;
      chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId }, (response) => {
        if (response?.success) showConnectedState();
      });
    }
  } catch (err) {
    // Silently fail - user can click button manually
    // Silent fail - user can click button manually
  }
}

/**
 * Auto-detect logged-in user from Twin Me app (button-triggered)
 * Uses chrome.scripting.executeScript to read localStorage from the app origin
 */
async function autoDetectUser() {
  autoDetectBtn.textContent = 'Detecting...';
  autoDetectBtn.disabled = true;
  detectStatus.classList.remove('hidden');
  detectStatus.textContent = 'Checking Twin Me app...';

  try {
    // First check if there's already a Twin Me tab open
    const tabs = await chrome.tabs.query({});
    let appTab = null;

    for (const tab of tabs) {
      if (tab.url && APP_ORIGINS.some(origin => tab.url.startsWith(origin))) {
        appTab = tab;
        break;
      }
    }

    if (!appTab) {
      // Open Twin Me in background to read localStorage
      detectStatus.textContent = 'Opening Twin Me to check login...';
      appTab = await chrome.tabs.create({
        url: APP_URL,
        active: false
      });
      // Wait for the page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Execute script on the Twin Me tab to read auth data
    const results = await chrome.scripting.executeScript({
      target: { tabId: appTab.id },
      func: () => {
        const authUser = localStorage.getItem('auth_user');
        const authToken = localStorage.getItem('auth_token');
        if (authUser) {
          try {
            const user = JSON.parse(authUser);
            return {
              userId: user.id,
              name: user.name || user.given_name || user.email,
              email: user.email
            };
          } catch (e) {
            return null;
          }
        }
        // Try decoding JWT as fallback
        if (authToken) {
          try {
            const payload = JSON.parse(atob(authToken.split('.')[1]));
            return {
              userId: payload.userId || payload.sub,
              name: payload.name || payload.email,
              email: payload.email
            };
          } catch (e) {
            return null;
          }
        }
        return null;
      }
    });

    const userData = results?.[0]?.result;

    if (userData?.userId) {
      userId = userData.userId;
      detectStatus.textContent = 'Found: ' + (userData.name || userData.email || userId.substring(0, 8) + '...');
      detectStatus.style.color = '#34d399';

      // Save and connect
      chrome.runtime.sendMessage({
        type: 'SET_USER_ID',
        userId
      }, (response) => {
        if (response?.success) {
          setTimeout(() => showConnectedState(), 500);
        }
      });
    } else {
      detectStatus.textContent = 'Not logged in. Sign into Twin Me first, or enter ID manually.';
      detectStatus.style.color = '#f87171';
      manualFallback.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Auto-detect failed:', err);
    detectStatus.textContent = 'Auto-detect failed. Please enter ID manually.';
    detectStatus.style.color = '#f87171';
    manualFallback.classList.remove('hidden');
  }

  autoDetectBtn.textContent = 'Detect My Account';
  autoDetectBtn.disabled = false;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  connectBtn.addEventListener('click', handleConnect);
  autoDetectBtn.addEventListener('click', autoDetectUser);

  observerToggle.addEventListener('click', () => {
    observerMode = !observerMode;
    observerToggle.classList.toggle('active');
    privacyNotice.style.display = observerMode ? 'block' : 'none';

    chrome.runtime.sendMessage({
      type: 'TOGGLE_OBSERVER_MODE',
      enabled: observerMode
    });

    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'OBSERVER_MODE_CHANGED',
          enabled: observerMode
        }).catch(() => {});
      });
    });
  });

  syncBtn.addEventListener('click', async () => {
    syncBtn.textContent = 'Syncing...';
    syncBtn.classList.add('syncing');
    syncBtn.disabled = true;

    chrome.runtime.sendMessage({ type: 'MANUAL_SYNC' }, async (response) => {
      if (response?.success) {
        await chrome.storage.local.set({ lastSync: new Date().toISOString() });
        lastSyncEl.textContent = 'Synced just now';
        updateStats();
      }

      syncBtn.textContent = 'Sync Now';
      syncBtn.classList.remove('syncing');
      syncBtn.disabled = false;
    });
  });

  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: APP_URL + '/insights/web' });
  });

  settingsBtn.addEventListener('click', () => {
    if (setupSection.classList.contains('hidden')) {
      setupSection.classList.remove('hidden');
      settingsBtn.textContent = 'Done';
    } else {
      setupSection.classList.add('hidden');
      settingsBtn.textContent = 'Settings';
    }
  });
}

/**
 * Handle connect button
 */
function handleConnect() {
  const inputUserId = userIdInput.value.trim();

  if (!inputUserId) {
    userIdInput.style.borderColor = 'rgba(239, 68, 68, 0.5)';
    setTimeout(() => { userIdInput.style.borderColor = ''; }, 1500);
    return;
  }

  userId = inputUserId;

  chrome.runtime.sendMessage({
    type: 'SET_USER_ID',
    userId
  }, (response) => {
    if (response?.success) {
      showConnectedState();
      setupSection.classList.add('hidden');
      settingsBtn.textContent = 'Settings';
    }
  });
}

/**
 * Show connected state
 */
function showConnectedState() {
  statusBadge.classList.remove('disconnected');
  statusBadge.classList.add('connected');
  statusText.textContent = 'Connected';

  setupSection.classList.add('hidden');
  connectedSection.classList.remove('hidden');
}

/**
 * Create a category tag element safely
 */
function createCategoryTag(cat, count) {
  const tag = document.createElement('div');
  const colorClass = CATEGORY_COLORS[cat.toLowerCase()] || 'cat-other';
  tag.className = 'category-tag ' + colorClass;

  const nameSpan = document.createTextNode(cat + ' ');
  const countSpan = document.createElement('span');
  countSpan.className = 'count';
  countSpan.textContent = count;

  tag.appendChild(nameSpan);
  tag.appendChild(countSpan);
  return tag;
}

/**
 * Create an activity item element safely
 */
function createActivityItem(item) {
  const title = item.title || item.raw_data?.title || 'Unknown page';
  const domain = item.domain || item.raw_data?.domain || '';
  const category = item.category || item.raw_data?.category || '';
  const timeOnPage = item.raw_data?.timeOnPage || 0;
  const timeStr = timeOnPage > 60 ? Math.round(timeOnPage / 60) + 'm' : timeOnPage + 's';

  const el = document.createElement('div');
  el.className = 'activity-item';

  // Favicon
  const favicon = document.createElement('div');
  favicon.className = 'activity-favicon';
  favicon.textContent = domain.charAt(0).toUpperCase() || '?';

  // Details
  const details = document.createElement('div');
  details.className = 'activity-details';

  const titleEl = document.createElement('div');
  titleEl.className = 'activity-title';
  titleEl.textContent = title;

  const metaEl = document.createElement('div');
  metaEl.className = 'activity-meta';
  metaEl.textContent = domain + (category ? ' \u00B7 ' + category : '');

  details.appendChild(titleEl);
  details.appendChild(metaEl);

  // Time
  const timeEl = document.createElement('div');
  timeEl.className = 'activity-time';
  timeEl.textContent = timeStr;

  el.appendChild(favicon);
  el.appendChild(details);
  el.appendChild(timeEl);

  return el;
}

/**
 * Update statistics
 */
async function updateStats() {
  const stored = await chrome.storage.local.get(['web_history', 'netflixData', 'youtube_history', 'twitch_history']);
  const webHistory = stored.web_history || [];

  // Count pages and searches
  const pages = webHistory.filter(e => e.data_type !== 'extension_search_query');
  const searches = webHistory.filter(e => e.data_type === 'extension_search_query');

  pagesCount.textContent = pages.length;
  searchesCount.textContent = searches.length;

  // Get unsynced count from background
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
    if (status) {
      const unsyncedWeb = webHistory.filter(d => !d.synced).length;
      const bufferSize = status.bufferSize || 0;
      unsyncedCount.textContent = unsyncedWeb + bufferSize;
    }
  });

  // Build category breakdown
  const categories = {};
  pages.forEach(page => {
    const cat = page.category || page.raw_data?.category || 'other';
    categories[cat] = (categories[cat] || 0) + 1;
  });

  if (Object.keys(categories).length > 0) {
    categoriesSection.classList.remove('hidden');
    categoriesList.textContent = '';

    const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 6);
    sorted.forEach(([cat, count]) => {
      categoriesList.appendChild(createCategoryTag(cat, count));
    });
  }

  // Build recent activity (last 4)
  const recent = webHistory
    .filter(e => e.data_type !== 'extension_search_query')
    .slice(-4)
    .reverse();

  if (recent.length > 0) {
    activitySection.classList.remove('hidden');
    activityList.textContent = '';

    recent.forEach(item => {
      activityList.appendChild(createActivityItem(item));
    });
  }
}

// Initialize on popup open
initialize();

// Update stats every 3 seconds while popup is open
setInterval(updateStats, 3000);
