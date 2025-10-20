/**
 * Background Service Worker for Soul Signature Browser Extension
 * Coordinates data collection from streaming, social, and delivery platforms
 */

import { EXTENSION_CONFIG, ENVIRONMENT } from './config.js';

const API_URL = EXTENSION_CONFIG.API_URL;
let authToken = null;

console.log(`[Soul Signature Background] Running in ${ENVIRONMENT} mode - API: ${API_URL}`);

// Load auth token on service worker startup
(async function loadAuthToken() {
  const result = await chrome.storage.sync.get(['authToken']);
  authToken = result.authToken;
  console.log('[Soul Signature Background] Auth token loaded on startup:', !!authToken);
  if (authToken) {
    console.log('[Soul Signature Background] Token preview:', authToken.substring(0, 20) + '...');
  }
})();

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Soul Signature] Extension installed');

  // Get auth token from storage
  chrome.storage.sync.get(['authToken'], (result) => {
    authToken = result.authToken;
    console.log('[Soul Signature] Auth token loaded on install:', !!authToken);
  });

  // Initialize platform settings (all enabled by default)
  chrome.storage.sync.get(['platformSettings'], (result) => {
    if (!result.platformSettings) {
      const defaultSettings = {
        netflix: { enabled: true },
        disneyplus: { enabled: true },
        hbomax: { enabled: true },
        primevideo: { enabled: true },
        instagram: { enabled: true }
      };
      chrome.storage.sync.set({ platformSettings: defaultSettings });
      console.log('[Soul Signature] Platform settings initialized');
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Soul Signature] Received message:', message.type);

  switch (message.type) {
    case 'SET_AUTH_TOKEN':
      authToken = message.token;
      chrome.storage.sync.set({ authToken: message.token });
      sendResponse({ success: true });
      break;

    case 'SEND_PLATFORM_DATA':
      // Check if platform is enabled before sending
      chrome.storage.sync.get(['platformSettings'], (result) => {
        const platformSettings = result.platformSettings || {};
        const isEnabled = platformSettings[message.platform]?.enabled !== false;

        if (!isEnabled) {
          sendResponse({ success: false, error: `${message.platform} data collection is disabled` });
          return;
        }

        sendDataToBackend(message.platform, message.data)
          .then(result => sendResponse({ success: true, result }))
          .catch(error => sendResponse({ success: false, error: error.message }));
      });
      return true; // Keep channel open for async response

    case 'GET_AUTH_STATUS':
      sendResponse({ authenticated: !!authToken });
      break;

    case 'PLATFORM_TOGGLED':
      console.log(`[Soul Signature] Platform ${message.platform} ${message.enabled ? 'enabled' : 'disabled'}`);
      sendResponse({ success: true });
      break;

    case 'SOUL_OBSERVER_DATA':
      sendSoulObserverData(message.data)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'SOUL_OBSERVER_SESSION_END':
      sendSoulObserverSession(message.data)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'SOUL_OBSERVER_EVENT':
      // Handle captured events from content script
      console.log('[Soul Observer] 📥 Received event batch from content script:', message.data?.length, 'events');
      console.log('[Soul Observer] Auth token available:', !!authToken);
      console.log('[Soul Observer] Sample event from batch:', message.data?.[0]);

      sendSoulObserverData({
        activities: message.data,
        insights: [] // Can be populated later with real-time insights
      })
        .then(result => {
          console.log('[Soul Observer] ✅ Successfully sent to backend:', result);
          sendResponse({ success: true, result });
        })
        .catch(error => {
          console.error('[Soul Observer] ❌ Failed to send events to backend:', error.message);
          console.error('[Soul Observer] Error details:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response

    case 'SOUL_OBSERVER_TOGGLED':
      console.log(`[Soul Observer] ${message.enabled ? 'Enabled' : 'Disabled'}`);
      chrome.storage.sync.get(['stats'], (result) => {
        const stats = result.stats || {};
        stats.soulObserverActive = message.enabled;
        chrome.storage.sync.set({ stats });
      });
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

/**
 * Send collected data to Soul Signature backend
 */
async function sendDataToBackend(platform, data) {
  if (!authToken) {
    throw new Error('Not authenticated. Please log in to Soul Signature.');
  }

  try {
    const response = await fetch(`${API_URL}/platforms/extract/${platform}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        platform,
        data,
        timestamp: new Date().toISOString(),
        source: 'browser_extension'
      })
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    const result = await response.json();
    console.log('[Soul Signature] Data sent successfully:', platform);
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.svg',
      title: 'Soul Signature',
      message: `${platform} data synced successfully!`
    });

    return result;
  } catch (error) {
    console.error('[Soul Signature] Error sending data:', error);
    throw error;
  }
}

/**
 * Send Soul Observer data to backend for AI processing
 */
async function sendSoulObserverData(data) {
  console.log('[Soul Observer] sendSoulObserverData called with:', data.activities?.length, 'activities');

  // CRITICAL: Always reload token from storage before sending (in case it was updated after service worker started)
  const tokenResult = await chrome.storage.sync.get(['authToken']);
  authToken = tokenResult.authToken;
  console.log('[Soul Observer] 🔄 Reloaded auth token from storage:', !!authToken);

  if (!authToken) {
    console.error('[Soul Observer] ❌ No auth token available!');
    throw new Error('Not authenticated');
  }

  const url = `${API_URL}/soul-observer/activity`;
  console.log('[Soul Observer] 🌐 Sending POST request to:', url);

  try {
    const payload = {
      activities: data.activities,
      insights: data.insights,
      timestamp: new Date().toISOString(),
      source: 'soul_observer'
    };

    console.log('[Soul Observer] Request payload:', {
      activitiesCount: payload.activities?.length,
      insightsCount: payload.insights?.length,
      timestamp: payload.timestamp,
      source: payload.source
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });

    console.log('[Soul Observer] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Soul Observer] Backend error response:', errorText);
      throw new Error(`Backend error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[Soul Observer] ✅ Activity data sent to AI for processing successfully');
    console.log('[Soul Observer] Backend result:', result);

    return result;
  } catch (error) {
    console.error('[Soul Observer] ❌ Error sending data:', error);
    console.error('[Soul Observer] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Send complete Soul Observer session data
 */
async function sendSoulObserverSession(sessionData) {
  if (!authToken) {
    throw new Error('Not authenticated');
  }

  try {
    const response = await fetch(`${API_URL}/soul-observer/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        ...sessionData,
        endTime: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    const result = await response.json();
    console.log('[Soul Observer] Session data sent for deep analysis');

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.svg',
      title: 'Soul Observer',
      message: 'Session analyzed! Check your Soul Signature dashboard for new insights.'
    });

    return result;
  } catch (error) {
    console.error('[Soul Observer] Error sending session:', error);
    throw error;
  }
}

/**
 * Periodic data collection (every 6 hours)
 */
chrome.alarms.create('periodicCollection', { periodInMinutes: 360 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodicCollection') {
    console.log('[Soul Signature] Running periodic data collection');

    // Get platform settings first
    chrome.storage.sync.get(['platformSettings'], (result) => {
      const platformSettings = result.platformSettings || {};

      // Trigger collection on supported tabs (only if platform is enabled)
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url) {
            let platform = null;

            if (tab.url.includes('netflix.com')) platform = 'netflix';
            else if (tab.url.includes('disneyplus.com')) platform = 'disneyplus';
            else if (tab.url.includes('hbomax.com') || tab.url.includes('max.com')) platform = 'hbomax';
            else if (tab.url.includes('primevideo.com') || tab.url.includes('amazon.com/gp/video')) platform = 'primevideo';
            else if (tab.url.includes('instagram.com')) platform = 'instagram';

            // Only collect if platform is enabled
            if (platform && platformSettings[platform]?.enabled !== false) {
              chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_DATA' });
            }
          }
        });
      });
    });
  }
});
