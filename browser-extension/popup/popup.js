/**
 * Soul Signature Extension Popup Logic
 */

// DOM elements
const notAuthenticatedSection = document.getElementById('not-authenticated');
const authenticatedSection = document.getElementById('authenticated');
const connectBtn = document.getElementById('connect-btn');
const syncBtn = document.getElementById('sync-btn');
const dashboardBtn = document.getElementById('dashboard-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const statusIndicator = document.getElementById('status-indicator');
const userIdElement = document.getElementById('user-id');
const youtubeCountElement = document.getElementById('youtube-count');
const netflixCountElement = document.getElementById('netflix-count');
const pendingCountElement = document.getElementById('pending-count');
const enableYoutubeCheckbox = document.getElementById('enable-youtube');
const enableNetflixCheckbox = document.getElementById('enable-netflix');
const enableHistoryImportCheckbox = document.getElementById('enable-history-import');

/**
 * Initialize popup
 */
async function initialize() {
  // Get status from background script
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response.isAuthenticated) {
      showAuthenticatedState(response);
    } else {
      showNotAuthenticatedState();
    }
  });

  // Load settings
  const settings = await chrome.storage.local.get([
    'enableYoutube',
    'enableNetflix',
    'enableHistoryImport'
  ]);

  enableYoutubeCheckbox.checked = settings.enableYoutube !== false; // Default true
  enableNetflixCheckbox.checked = settings.enableNetflix !== false; // Default true
  enableHistoryImportCheckbox.checked = settings.enableHistoryImport === true; // Default false

  // Load stats
  updateStats();
}

/**
 * Show not authenticated state
 */
function showNotAuthenticatedState() {
  notAuthenticatedSection.style.display = 'block';
  authenticatedSection.style.display = 'none';
}

/**
 * Show authenticated state
 */
function showAuthenticatedState(status) {
  notAuthenticatedSection.style.display = 'none';
  authenticatedSection.style.display = 'block';

  // Update user info
  if (status.userId) {
    const shortId = status.userId.substring(0, 8) + '...';
    userIdElement.textContent = shortId;
    userIdElement.title = status.userId; // Full ID on hover
  }
}

/**
 * Update stats
 */
async function updateStats() {
  // Get pending events
  const result = await chrome.storage.local.get(['pending_youtube', 'pending_netflix']);

  const youtubePending = (result.pending_youtube || []).length;
  const netflixPending = (result.pending_netflix || []).length;
  const totalPending = youtubePending + netflixPending;

  youtubeCountElement.textContent = youtubePending > 0 ? `${youtubePending} pending` : '0 videos';
  netflixCountElement.textContent = netflixPending > 0 ? `${netflixPending} pending` : '0 shows';
  pendingCountElement.textContent = totalPending > 0 ? `${totalPending} events` : 'All synced ✓';
}

/**
 * Handle connect button click
 */
connectBtn.addEventListener('click', () => {
  // Open authentication page
  chrome.tabs.create({
    url: 'https://twin-ai-learn.vercel.app/soul-dashboard?extension=connect'
  });
});

/**
 * Handle sync button click
 */
syncBtn.addEventListener('click', async () => {
  syncBtn.classList.add('loading');
  syncBtn.textContent = 'Syncing';

  chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
    syncBtn.classList.remove('loading');
    syncBtn.textContent = 'Sync Now';

    // Update stats
    updateStats();

    // Show success message
    const statusValue = statusIndicator.querySelector('.status-value');
    statusValue.textContent = 'Synced ✓';
    setTimeout(() => {
      statusValue.innerHTML = '<span class="dot dot-green"></span> Connected';
    }, 2000);
  });
});

/**
 * Handle dashboard button click
 */
dashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://twin-ai-learn.vercel.app/soul-dashboard'
  });
});

/**
 * Handle disconnect button click
 */
disconnectBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to disconnect? Your tracking data will be saved.')) {
    await chrome.storage.local.clear();
    showNotAuthenticatedState();
  }
});

/**
 * Handle settings changes
 */
enableYoutubeCheckbox.addEventListener('change', (e) => {
  chrome.storage.local.set({ enableYoutube: e.target.checked });
});

enableNetflixCheckbox.addEventListener('change', (e) => {
  chrome.storage.local.set({ enableNetflix: e.target.checked });
});

enableHistoryImportCheckbox.addEventListener('change', (e) => {
  chrome.storage.local.set({ enableHistoryImport: e.target.checked });

  if (e.target.checked) {
    // Show instructions
    alert('Visit youtube.com/feed/history to import your watch history automatically.');
  }
});

/**
 * Listen for authentication events from website
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTHENTICATION_SUCCESS') {
    showAuthenticatedState(message.data);
  }
});

// Initialize on load
initialize();

// Refresh stats every 10 seconds
setInterval(updateStats, 10000);
