/**
 * Soul Signature Collector - Background Service Worker
 * Handles message passing, data storage, and API communication
 */

const API_URL = 'http://localhost:3001/api';

// ========================================
// Authentication Functions (inlined to avoid ES module issues)
// ========================================

/**
 * Get auth token from storage
 */
async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auth_token'], (result) => {
      resolve(result.auth_token || null);
    });
  });
}

/**
 * Check if user is authenticated
 */
async function isAuthenticated() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auth_token', 'token_expires'], (result) => {
      if (!result.auth_token) {
        resolve(false);
        return;
      }

      // Check if token is expired
      if (result.token_expires && Date.now() > result.token_expires) {
        chrome.storage.local.remove(['auth_token', 'user_id', 'token_expires']);
        resolve(false);
        return;
      }

      resolve(true);
    });
  });
}

/**
 * Save authentication data
 */
async function saveAuthData(authToken, userId, expiresIn = 86400) {
  return new Promise((resolve) => {
    const tokenExpires = Date.now() + (expiresIn * 1000);

    chrome.storage.local.set({
      auth_token: authToken,
      user_id: userId,
      token_expires: tokenExpires
    }, () => {
      console.log('[Auth] Authentication data saved');
      resolve(true);
    });
  });
}

/**
 * Clear authentication data (logout)
 */
async function clearAuthData() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['auth_token', 'user_id', 'token_expires'], () => {
      console.log('[Auth] Authentication data cleared');
      resolve(true);
    });
  });
}

/**
 * Auto-refresh token before expiration
 */
async function refreshTokenIfNeeded() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auth_token', 'token_expires'], async (result) => {
      if (!result.auth_token || !result.token_expires) {
        resolve(false);
        return;
      }

      // Refresh if token expires in less than 1 hour
      const timeUntilExpiry = result.token_expires - Date.now();
      const oneHour = 60 * 60 * 1000;

      if (timeUntilExpiry < oneHour) {
        console.log('[Auth] Token expiring soon, refreshing...');

        try {
          const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${result.auth_token}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            await saveAuthData(data.token, data.userId, data.expiresIn);
            console.log('[Auth] Token refreshed successfully');
            resolve(true);
          } else {
            console.error('[Auth] Token refresh failed');
            await clearAuthData();
            resolve(false);
          }
        } catch (error) {
          console.error('[Auth] Token refresh error:', error);
          resolve(false);
        }
      } else {
        resolve(true);
      }
    });
  });
}

// ========================================
// Message Listeners
// ========================================

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Service Worker] Received message:', message.type);

  switch (message.type) {
    case 'CAPTURE_NETFLIX_DATA':
      handleNetflixData(message.data, sender.tab);
      sendResponse({ success: true });
      break;

    case 'CAPTURE_YOUTUBE_DATA':
      handleYouTubeData(message.data, sender.tab);
      sendResponse({ success: true });
      break;

    case 'CAPTURE_REDDIT_DATA':
      handleRedditData(message.data, sender.tab);
      sendResponse({ success: true });
      break;

    case 'GET_AUTH_TOKEN':
      getAuthToken().then(token => {
        sendResponse({ token });
      });
      return true; // Keep message channel open for async response

    case 'TRIGGER_SYNC':
      syncLocalDataToBackend().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'EXTENSION_AUTH_SUCCESS':
      // Handle auth from web app
      console.log('[Service Worker] 🔑 EXTENSION_AUTH_SUCCESS received!');
      console.log('[Service Worker] Message data:', message.data);

      const { authToken, userId, expiresIn } = message.data;
      console.log('[Service Worker] Auth details - userId:', userId, 'expiresIn:', expiresIn, 'tokenLength:', authToken?.length);

      saveAuthData(authToken, userId, expiresIn)
        .then(() => {
          console.log('[Service Worker] ✅ Authentication successful - data saved to storage');
          sendResponse({ success: true });
          // Notify popup to update UI
          chrome.runtime.sendMessage({ type: 'AUTH_STATUS_CHANGED', authenticated: true }).catch(() => {
            console.log('[Service Worker] Popup not open (normal)');
          });
        })
        .catch(error => {
          console.error('[Service Worker] ❌ Failed to save auth data:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'CHECK_AUTH_STATUS':
      isAuthenticated().then(authenticated => {
        sendResponse({ authenticated });
      });
      return true;

    default:
      console.warn('[Service Worker] Unknown message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return false;
});

/**
 * Handle Netflix viewing data
 */
async function handleNetflixData(data, tab) {
  console.log('[Netflix] Captured data:', data);

  try {
    // Store locally first
    chrome.storage.local.get(['netflix_history'], (result) => {
      const history = result.netflix_history || [];
      history.push({
        ...data,
        capturedAt: new Date().toISOString(),
        tabUrl: tab?.url || 'unknown'
      });

      // Keep only last 100 items locally
      if (history.length > 100) {
        history.shift();
      }

      chrome.storage.local.set({ netflix_history: history });
    });

    // Send to backend
    await sendToBackend('netflix', data);
  } catch (error) {
    console.error('[Netflix] Error handling data:', error);
  }
}

/**
 * Handle YouTube viewing data
 */
async function handleYouTubeData(data, tab) {
  console.log('[YouTube] Captured data:', data);

  try {
    chrome.storage.local.get(['youtube_history'], (result) => {
      const history = result.youtube_history || [];
      history.push({
        ...data,
        capturedAt: new Date().toISOString(),
        tabUrl: tab?.url || 'unknown'
      });

      if (history.length > 100) {
        history.shift();
      }

      chrome.storage.local.set({ youtube_history: history });
    });

    await sendToBackend('youtube', data);
  } catch (error) {
    console.error('[YouTube] Error handling data:', error);
  }
}

/**
 * Handle Reddit browsing data
 */
async function handleRedditData(data, tab) {
  console.log('[Reddit] Captured data:', data);

  try {
    chrome.storage.local.get(['reddit_history'], (result) => {
      const history = result.reddit_history || [];
      history.push({
        ...data,
        capturedAt: new Date().toISOString(),
        tabUrl: tab?.url || 'unknown'
      });

      if (history.length > 100) {
        history.shift();
      }

      chrome.storage.local.set({ reddit_history: history });
    });

    await sendToBackend('reddit', data);
  } catch (error) {
    console.error('[Reddit] Error handling data:', error);
  }
}

/**
 * Send captured data to backend API
 */
async function sendToBackend(platform, data) {
  try {
    const token = await getAuthToken();

    if (!token) {
      console.warn('[API] No auth token found, data stored locally only');
      return;
    }

    const response = await fetch(`${API_URL}/extension/capture/${platform}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('[API] Data sent successfully:', result);
  } catch (error) {
    console.error('[API] Error sending data:', error);
    // Data is already stored locally, so this is not critical
  }
}

/**
 * Set up alarms when service worker installs
 */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');

  event.waitUntil((async () => {
    try {
      // Set up alarm for periodic data sync and token refresh
      await chrome.alarms.create('sync-data', {
        periodInMinutes: 30 // Sync every 30 minutes
      });

      await chrome.alarms.create('token-refresh', {
        periodInMinutes: 60 // Check token every hour
      });

      // Set up alarm listener
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'sync-data') {
          syncLocalDataToBackend().catch(err => {
            console.error('[Alarm] Sync failed:', err);
          });
        }

        if (alarm.name === 'token-refresh') {
          refreshTokenIfNeeded().catch(err => {
            console.error('[Alarm] Token refresh failed:', err);
          });
        }
      });

      console.log('[Service Worker] Alarms configured');
    } catch (error) {
      console.error('[Service Worker] Error setting up alarms:', error);
    }
  })());
});

/**
 * Sync all locally stored data to backend
 */
async function syncLocalDataToBackend() {
  console.log('[Sync] Starting sync...');

  const token = await getAuthToken();
  if (!token) {
    console.log('[Sync] No auth token, skipping sync');
    throw new Error('Not authenticated');
  }

  try {
    const storage = await chrome.storage.local.get([
      'netflix_history',
      'youtube_history',
      'reddit_history'
    ]);

    const allEvents = [];

    // Collect all events
    for (const [key, data] of Object.entries(storage)) {
      if (data && Array.isArray(data) && data.length > 0) {
        const platform = key.replace('_history', '');
        allEvents.push(...data.map(event => ({ ...event, platform })));
      }
    }

    if (allEvents.length === 0) {
      console.log('[Sync] No data to sync');
      return;
    }

    console.log(`[Sync] Syncing ${allEvents.length} total items`);

    // Send batch to backend
    const response = await fetch(`${API_URL}/extension/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ events: allEvents })
    });

    if (!response.ok) {
      throw new Error(`Batch sync failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('[Sync] Sync complete:', result);
  } catch (error) {
    console.error('[Sync] Sync error:', error);
    throw error;
  }
}

console.log('[Service Worker] Soul Signature Collector initialized');
