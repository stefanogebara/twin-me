/**
 * Background Service Worker
 * Handles data processing and API communication
 */

console.log('[Soul Signature] Background service worker initialized');

// Configuration
const API_URL = 'https://twin-ai-learn.vercel.app/api';
const LOCAL_API_URL = 'http://localhost:3001/api';

// State
let apiUrl = API_URL;
let userId = null;
let isAuthenticated = false;

/**
 * Initialize extension
 */
async function initialize() {
  // Load saved settings
  const result = await chrome.storage.local.get(['userId', 'apiUrl', 'authToken']);

  if (result.userId) {
    userId = result.userId;
    isAuthenticated = true;
  }

  if (result.apiUrl) {
    apiUrl = result.apiUrl;
  }

  console.log('[Soul Signature] Initialized:', { userId, apiUrl: apiUrl, isAuthenticated });
}

/**
 * Send data to Soul Signature API
 */
async function sendToAPI(endpoint, data) {
  if (!isAuthenticated) {
    console.warn('[Soul Signature] Not authenticated, skipping API call');
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const result = await chrome.storage.local.get(['authToken']);
    const authToken = result.authToken;

    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('[Soul Signature] API response:', result);

    return { success: true, data: result };
  } catch (error) {
    console.error('[Soul Signature] API error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Store data locally (for offline/batch processing)
 */
async function storeLocally(type, platform, data) {
  const key = `pending_${platform}`;
  const result = await chrome.storage.local.get([key]);
  const pending = result[key] || [];

  pending.push({
    type,
    platform,
    data,
    timestamp: new Date().toISOString()
  });

  await chrome.storage.local.set({ [key]: pending });
  console.log(`[Soul Signature] Stored locally: ${pending.length} pending ${platform} events`);
}

/**
 * Process video watch event
 */
async function processVideoEvent(message) {
  const { type, platform, data } = message;

  console.log(`[Soul Signature] Processing ${type} for ${platform}:`, data);

  // Store locally first (backup)
  await storeLocally(type, platform, data);

  // Send to API
  if (isAuthenticated && userId) {
    const endpoint = '/soul/extension-tracking';
    const payload = {
      userId,
      platform,
      eventType: type,
      data: {
        ...data,
        extractedAt: new Date().toISOString()
      }
    };

    await sendToAPI(endpoint, payload);
  }

  // Update badge to show activity
  await chrome.action.setBadgeText({ text: '✓' });
  await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 3000);
}

/**
 * Process historical import
 */
async function processHistoricalImport(message) {
  const { platform, data } = message;

  console.log(`[Soul Signature] Processing historical import for ${platform}: ${data.length} items`);

  if (!isAuthenticated || !userId) {
    console.warn('[Soul Signature] Not authenticated, skipping historical import');
    return;
  }

  // Send in batches of 50
  const batchSize = 50;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);

    const endpoint = '/soul/extension-historical-import';
    const payload = {
      userId,
      platform,
      videos: batch,
      importedAt: new Date().toISOString()
    };

    await sendToAPI(endpoint, payload);

    // Wait between batches to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`[Soul Signature] Historical import complete: ${data.length} items`);
}

/**
 * Sync pending data (for when user comes back online)
 */
async function syncPendingData() {
  if (!isAuthenticated) return;

  const platforms = ['youtube', 'netflix'];

  for (const platform of platforms) {
    const key = `pending_${platform}`;
    const result = await chrome.storage.local.get([key]);
    const pending = result[key] || [];

    if (pending.length === 0) continue;

    console.log(`[Soul Signature] Syncing ${pending.length} pending ${platform} events`);

    for (const event of pending) {
      await processVideoEvent(event);
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
    }

    // Clear pending after sync
    await chrome.storage.local.set({ [key]: [] });
  }
}

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Soul Signature] Received message:', message.type, message.platform);

  switch (message.type) {
    case 'VIDEO_STARTED':
    case 'VIDEO_PROGRESS':
    case 'VIDEO_ENDED':
      processVideoEvent(message);
      break;

    case 'HISTORICAL_IMPORT':
      processHistoricalImport(message);
      break;

    case 'AUTHENTICATE':
      // Handle authentication from popup
      userId = message.userId;
      isAuthenticated = true;
      chrome.storage.local.set({
        userId: message.userId,
        authToken: message.authToken
      });
      sendResponse({ success: true });
      break;

    case 'GET_STATUS':
      sendResponse({
        isAuthenticated,
        userId,
        apiUrl
      });
      break;

    case 'SYNC_NOW':
      syncPendingData().then(() => {
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response

    default:
      console.warn('[Soul Signature] Unknown message type:', message.type);
  }

  return false;
});

/**
 * Handle extension install/update
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Soul Signature] Extension installed');

    // Open welcome page
    chrome.tabs.create({
      url: 'https://twin-ai-learn.vercel.app/soul-dashboard?extension=installed'
    });
  } else if (details.reason === 'update') {
    console.log('[Soul Signature] Extension updated to', chrome.runtime.getManifest().version);
  }
});

/**
 * Periodic sync (every hour)
 */
chrome.alarms.create('sync', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync') {
    console.log('[Soul Signature] Running periodic sync');
    syncPendingData();
  }
});

// Initialize on startup
initialize();
