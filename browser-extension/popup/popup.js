/**
 * Popup UI Logic
 * Controls for Soul Signature browser extension
 */

let userId = null;
let observerMode = false;

// DOM elements
const connectionStatus = document.getElementById('connection-status');
const setupSection = document.getElementById('setup-section');
const controlsSection = document.getElementById('controls-section');
const statsSection = document.getElementById('stats-section');
const userIdInput = document.getElementById('user-id-input');
const connectBtn = document.getElementById('connect-btn');
const observerToggle = document.getElementById('observer-toggle');
const privacyNotice = document.getElementById('privacy-notice');
const syncBtn = document.getElementById('sync-btn');
const dashboardBtn = document.getElementById('dashboard-btn');

// Stat elements
const netflixCount = document.getElementById('netflix-count');
const activityCount = document.getElementById('activity-count');
const unsyncedCount = document.getElementById('unsynced-count');
const lastSync = document.getElementById('last-sync');

/**
 * Initialize popup
 */
async function initialize() {
  // Load stored data
  const stored = await chrome.storage.local.get(['userId', 'observerMode', 'lastSync']);
  
  if (stored.userId) {
    userId = stored.userId;
    userIdInput.value = userId;
    showConnectedState();
  }
  
  if (stored.observerMode) {
    observerMode = stored.observerMode;
    observerToggle.classList.add('active');
    privacyNotice.style.display = 'block';
  }
  
  if (stored.lastSync) {
    lastSync.textContent = new Date(stored.lastSync).toLocaleString();
  }
  
  // Update stats
  updateStats();
  
  // Setup event listeners
  setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  connectBtn.addEventListener('click', handleConnect);
  
  observerToggle.addEventListener('click', () => {
    observerMode = !observerMode;
    observerToggle.classList.toggle('active');
    privacyNotice.style.display = observerMode ? 'block' : 'none';
    
    chrome.runtime.sendMessage({
      type: 'TOGGLE_OBSERVER_MODE',
      enabled: observerMode
    });
    
    // Notify all tabs about observer mode change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'OBSERVER_MODE_CHANGED',
          enabled: observerMode
        }).catch(() => {}); // Ignore errors for tabs that don't have content script
      });
    });
  });
  
  syncBtn.addEventListener('click', async () => {
    syncBtn.textContent = 'Syncing...';
    syncBtn.disabled = true;
    
    chrome.runtime.sendMessage({ type: 'MANUAL_SYNC' }, async (response) => {
      if (response?.success) {
        await chrome.storage.local.set({ lastSync: new Date().toISOString() });
        lastSync.textContent = new Date().toLocaleString();
        updateStats();
      }
      
      syncBtn.textContent = 'Sync Now';
      syncBtn.disabled = false;
    });
  });
  
  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:8086/soul-dashboard' });
  });
}

/**
 * Handle connect button
 */
function handleConnect() {
  const inputUserId = userIdInput.value.trim();
  
  if (!inputUserId) {
    alert('Please enter your User ID');
    return;
  }
  
  userId = inputUserId;
  
  chrome.runtime.sendMessage({
    type: 'SET_USER_ID',
    userId
  }, (response) => {
    if (response?.success) {
      showConnectedState();
    }
  });
}

/**
 * Show connected state
 */
function showConnectedState() {
  connectionStatus.classList.remove('status-disconnected');
  connectionStatus.classList.add('status-connected');
  connectionStatus.querySelector('span').textContent = `Connected: ${userId.substring(0, 8)}...`;
  
  setupSection.style.display = 'none';
  controlsSection.style.display = 'block';
  statsSection.style.display = 'block';
}

/**
 * Update statistics
 */
async function updateStats() {
  const { netflixData = [], interpretations = [] } = await chrome.storage.local.get(['netflixData', 'interpretations']);
  
  // Get background status
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
    if (status) {
      const unsyncedNetflix = netflixData.filter(d => !d.synced).length;
      const unsyncedActivities = status.bufferSize || 0;
      
      netflixCount.textContent = netflixData.length;
      activityCount.textContent = interpretations.length;
      unsyncedCount.textContent = unsyncedNetflix + unsyncedActivities;
    }
  });
}

// Initialize on popup open
initialize();

// Update stats every 2 seconds while popup is open
setInterval(updateStats, 2000);
