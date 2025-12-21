/**
 * Soul Signature Collector - Popup UI Controller
 */

const API_URL = 'http://localhost:3001';
const AUTH_PAGE_URL = 'http://localhost:8086/extension-auth';

// Initialize popup on load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] Initializing...');
  await loadStats();
  await checkConnectionStatus();
  setupEventListeners();
});

/**
 * Load captured data statistics from local storage
 */
async function loadStats() {
  try {
    const result = await chrome.storage.local.get(['netflix_history', 'youtube_history', 'reddit_history']);

    const netflixCount = result.netflix_history?.length || 0;
    const youtubeCount = result.youtube_history?.length || 0;
    const redditCount = result.reddit_history?.length || 0;
    const total = netflixCount + youtubeCount + redditCount;

    document.getElementById('netflix-count').textContent = netflixCount;
    document.getElementById('youtube-count').textContent = youtubeCount;
    document.getElementById('reddit-count').textContent = redditCount;
    document.getElementById('total-count').textContent = total;

    console.log('[Popup] Stats loaded:', { netflixCount, youtubeCount, redditCount, total });
  } catch (error) {
    console.error('[Popup] Error loading stats:', error);
  }
}

/**
 * Check if user is authenticated
 */
async function isAuthenticated() {
  try {
    const result = await chrome.storage.local.get(['auth_token', 'auth_expiry']);

    if (!result.auth_token) {
      return false;
    }

    // Check if token is expired
    if (result.auth_expiry && new Date(result.auth_expiry) < new Date()) {
      console.log('[Popup] Auth token expired');
      await chrome.storage.local.remove(['auth_token', 'auth_expiry', 'user_id']);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Popup] Error checking auth:', error);
    return false;
  }
}

/**
 * Check connection status and update UI
 */
async function checkConnectionStatus() {
  const authenticated = await isAuthenticated();
  const statusDiv = document.getElementById('status');
  const connectButton = document.getElementById('connect-button');

  if (authenticated) {
    statusDiv.className = 'status connected';
    statusDiv.innerHTML = '<span class="status-icon">✓</span><span>Connected to Twin AI Learn</span>';
    connectButton.textContent = 'Disconnect';
    console.log('[Popup] Status: Connected');
  } else {
    statusDiv.className = 'status disconnected';
    statusDiv.innerHTML = '<span class="status-icon">⚠️</span><span>Not connected</span>';
    connectButton.textContent = 'Connect to Twin AI Learn';
    console.log('[Popup] Status: Disconnected');
  }
}

/**
 * Setup event listeners for buttons
 */
function setupEventListeners() {
  document.getElementById('connect-button').addEventListener('click', handleConnect);
  document.getElementById('sync-button').addEventListener('click', handleSync);
  console.log('[Popup] Event listeners setup');
}

/**
 * Handle connect/disconnect button click
 */
async function handleConnect() {
  console.log('[Popup] Connect button clicked');
  const authenticated = await isAuthenticated();

  if (authenticated) {
    // Disconnect
    const confirmed = confirm('Disconnect from Twin AI Learn? Your local data will be preserved.');
    if (confirmed) {
      await chrome.storage.local.remove(['auth_token', 'auth_expiry', 'user_id']);
      console.log('[Popup] Disconnected - auth data cleared');
      await checkConnectionStatus();
    }
  } else {
    // Connect - open auth page
    console.log('[Popup] Opening auth page:', AUTH_PAGE_URL);
    chrome.tabs.create({ url: AUTH_PAGE_URL });
  }
}

/**
 * Handle manual sync button click
 */
async function handleSync() {
  const button = document.getElementById('sync-button');
  const originalText = button.textContent;

  console.log('[Popup] Manual sync triggered');
  button.textContent = 'Syncing...';
  button.disabled = true;

  try {
    // Send message to service worker to trigger sync
    const response = await chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' });

    console.log('[Popup] Sync response:', response);
    button.textContent = '✓ Synced!';

    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('[Popup] Sync failed:', error);
    button.textContent = '✗ Sync Failed';

    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  }
}

/**
 * Listen for storage changes to update UI in real-time
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    console.log('[Popup] Storage changed, reloading stats');
    loadStats();
    checkConnectionStatus();
  }
});

console.log('[Popup] Script loaded');
