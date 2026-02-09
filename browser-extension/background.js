/**
 * Soul Signature Browser Extension - Background Service Worker
 * Handles data collection, API communication, and LLM interpretation
 */

// Import configuration
import { EXTENSION_CONFIG } from './config.js';

// Configuration
const API_BASE_URL = EXTENSION_CONFIG.API_URL;
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

// API URL configured via config.js

// State
let userId = null;
let observerMode = false;
let activityBuffer = [];

/**
 * Initialize extension
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Soul Signature] Extension installed');
  
  // Load user ID from storage
  const { userId: storedUserId, observerMode: storedMode } = await chrome.storage.local.get(['userId', 'observerMode']);
  userId = storedUserId;
  observerMode = storedMode || false;
  
  // Setup periodic sync
  chrome.alarms.create('sync-data', { periodInMinutes: 5 });
  
  // Setup activity flush
  chrome.alarms.create('flush-activity', { periodInMinutes: 1 });
});

/**
 * Handle alarm events
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-data') {
    await syncCollectedData();
  } else if (alarm.name === 'flush-activity') {
    await flushActivityBuffer();
  }
});

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Message handling
  
  switch (message.type) {
    case 'SET_USER_ID':
      userId = message.userId;
      chrome.storage.local.set({ userId });
      sendResponse({ success: true });
      break;
      
    case 'TOGGLE_OBSERVER_MODE':
      observerMode = message.enabled;
      chrome.storage.local.set({ observerMode });
      sendResponse({ success: true, enabled: observerMode });
      break;
      
    case 'GET_STATUS':
      sendResponse({
        userId,
        observerMode,
        bufferSize: activityBuffer.length
      });
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

    case 'WEB_BROWSING_EVENT':
      // Web browsing events work independently of observer mode -
      // they just need a connected user (userId set).
      handleWebBrowsingData(message.data);
      sendResponse({ success: true });
      break;

    case 'BROWSING_ACTIVITY':
      if (observerMode) {
        handleBrowsingActivity(message.data, sender.tab);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, reason: 'Observer mode disabled' });
      }
      break;
      
    case 'MANUAL_SYNC':
      syncCollectedData().then(() => {
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  return false;
});

/**
 * Handle Netflix watch history data
 */
async function handleNetflixData(data) {
  console.log('[Background] Received Netflix data:', data);
  
  // Store locally first
  const { netflixData = [] } = await chrome.storage.local.get('netflixData');
  netflixData.push({
    ...data,
    collectedAt: new Date().toISOString(),
    synced: false
  });
  await chrome.storage.local.set({ netflixData });
  
  // Update badge
  updateBadge();
}

/**
 * Handle YouTube watch history data from content script
 */
async function handleYouTubeData(data) {
  console.log('[Background] Received YouTube data:', data.events?.length || 0, 'events');

  const { youtube_history = [] } = await chrome.storage.local.get('youtube_history');

  const newEvents = (data.events || []).map(event => ({
    ...event,
    platform: 'youtube',
    collectedAt: new Date().toISOString(),
    synced: false
  }));

  const combined = [...youtube_history, ...newEvents];
  // FIFO: keep last 500
  const trimmed = combined.slice(-500);
  await chrome.storage.local.set({ youtube_history: trimmed });

  // Send to backend
  await sendToBackend('youtube', newEvents);

  updateBadge();
}

/**
 * Handle Twitch stream/activity data from content script
 */
async function handleTwitchData(data) {
  console.log('[Background] Received Twitch data:', data.events?.length || 0, 'events');

  const { twitch_history = [] } = await chrome.storage.local.get('twitch_history');

  const newEvents = (data.events || []).map(event => ({
    ...event,
    platform: 'twitch',
    collectedAt: new Date().toISOString(),
    synced: false
  }));

  const combined = [...twitch_history, ...newEvents];
  const trimmed = combined.slice(-500);
  await chrome.storage.local.set({ twitch_history: trimmed });

  await sendToBackend('twitch', newEvents);

  updateBadge();
}

/**
 * Handle web browsing data from soul-observer.js universal collector
 */
async function handleWebBrowsingData(data) {
  console.log('[Background] Received web browsing data:', data.events?.length || 0, 'events');

  const { web_history = [] } = await chrome.storage.local.get('web_history');

  const newEvents = (data.events || []).map(event => ({
    ...event,
    platform: 'web',
    collectedAt: new Date().toISOString(),
    synced: false
  }));

  const combined = [...web_history, ...newEvents];
  // FIFO: keep last 500
  const trimmed = combined.slice(-500);
  await chrome.storage.local.set({ web_history: trimmed });

  // Send to backend
  await sendToBackend('web', newEvents);

  updateBadge();
}

/**
 * Send captured events to backend API
 */
async function sendToBackend(platform, events) {
  if (!userId || events.length === 0) return;

  // Use stored JWT auth_token (from web app auth bridge), falling back to userId
  const { auth_token } = await chrome.storage.local.get('auth_token');
  const token = auth_token || userId;

  try {
    const response = await fetch(`${API_BASE_URL}/extension/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ platform, events })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Background] Sent ${result.inserted} ${platform} events to backend`);

      // Mark events as synced in storage
      const storageKey = `${platform}_history`;
      const { [storageKey]: history = [] } = await chrome.storage.local.get(storageKey);
      const updatedHistory = history.map(e => ({ ...e, synced: true }));
      await chrome.storage.local.set({ [storageKey]: updatedHistory });
    } else {
      console.error(`[Background] Backend rejected ${platform} events:`, response.statusText);
    }
  } catch (error) {
    console.error(`[Background] Failed to send ${platform} events:`, error.message);
  }
}

/**
 * Handle browsing activity
 */
async function handleBrowsingActivity(activity, tab) {
  if (!observerMode) return;
  
  console.log('[Background] Recording browsing activity:', activity.type);
  
  activityBuffer.push({
    ...activity,
    url: tab?.url,
    title: tab?.title,
    timestamp: new Date().toISOString(),
    tabId: tab?.id
  });
  
  // Limit buffer size
  if (activityBuffer.length > 100) {
    await flushActivityBuffer();
  }
  
  updateBadge();
}

/**
 * Flush activity buffer to API
 */
async function flushActivityBuffer() {
  if (activityBuffer.length === 0 || !userId) return;
  
  console.log(`[Background] Flushing ${activityBuffer.length} activities to API`);
  
  try {
    // Send to LLM interpretation endpoint
    const response = await fetch(`${API_BASE_URL}/soul-observer/interpret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        activities: activityBuffer,
        requestInterpretation: true
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('[Background] Activities interpreted:', result);
      
      // Clear buffer
      activityBuffer = [];
      
      // Store interpretation
      if (result.interpretation) {
        const { interpretations = [] } = await chrome.storage.local.get('interpretations');
        interpretations.push({
          timestamp: new Date().toISOString(),
          activityCount: result.activityCount,
          interpretation: result.interpretation,
          insights: result.insights
        });
        await chrome.storage.local.set({ interpretations });
      }
    } else {
      console.error('[Background] Failed to flush activities:', response.statusText);
    }
  } catch (error) {
    console.error('[Background] Error flushing activities:', error);
  }
}

/**
 * Sync all collected data to API
 */
async function syncCollectedData() {
  if (!userId) {
    console.log('[Background] No user ID - skipping sync');
    return;
  }
  
  console.log('[Background] Syncing collected data...');
  
  try {
    // Get unsynced Netflix data
    const { netflixData = [] } = await chrome.storage.local.get('netflixData');
    const unsyncedNetflix = netflixData.filter(d => !d.synced);

    if (unsyncedNetflix.length > 0) {
      console.log(`[Background] Syncing ${unsyncedNetflix.length} Netflix items`);

      const response = await fetch(`${API_BASE_URL}/soul-observer/netflix`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          data: unsyncedNetflix
        })
      });

      if (response.ok) {
        const updatedData = netflixData.map(d =>
          unsyncedNetflix.includes(d) ? { ...d, synced: true } : d
        );
        await chrome.storage.local.set({ netflixData: updatedData });
        console.log('[Background] Netflix data synced successfully');
      }
    }

    // Sync unsynced YouTube data
    const { youtube_history = [] } = await chrome.storage.local.get('youtube_history');
    const unsyncedYoutube = youtube_history.filter(d => !d.synced);
    if (unsyncedYoutube.length > 0) {
      console.log(`[Background] Syncing ${unsyncedYoutube.length} YouTube items`);
      await sendToBackend('youtube', unsyncedYoutube);
    }

    // Sync unsynced Twitch data
    const { twitch_history = [] } = await chrome.storage.local.get('twitch_history');
    const unsyncedTwitch = twitch_history.filter(d => !d.synced);
    if (unsyncedTwitch.length > 0) {
      console.log(`[Background] Syncing ${unsyncedTwitch.length} Twitch items`);
      await sendToBackend('twitch', unsyncedTwitch);
    }

    // Sync unsynced Web browsing data
    const { web_history = [] } = await chrome.storage.local.get('web_history');
    const unsyncedWeb = web_history.filter(d => !d.synced);
    if (unsyncedWeb.length > 0) {
      console.log(`[Background] Syncing ${unsyncedWeb.length} Web browsing items`);
      await sendToBackend('web', unsyncedWeb);
    }

    // Flush any pending activities
    await flushActivityBuffer();

    updateBadge();
  } catch (error) {
    console.error('[Background] Sync error:', error);
  }
}

/**
 * Update extension badge
 */
async function updateBadge() {
  const { netflixData = [], youtube_history = [], twitch_history = [], web_history = [] } = await chrome.storage.local.get(['netflixData', 'youtube_history', 'twitch_history', 'web_history']);
  const unsyncedCount = netflixData.filter(d => !d.synced).length
    + youtube_history.filter(d => !d.synced).length
    + twitch_history.filter(d => !d.synced).length
    + web_history.filter(d => !d.synced).length
    + activityBuffer.length;
  
  if (unsyncedCount > 0) {
    chrome.action.setBadgeText({ text: String(unsyncedCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#D97706' }); // Orange
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Listen for tab updates to track browsing
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!observerMode || !userId) return;
  
  if (changeInfo.status === 'complete' && tab.url) {
    // Record page visit
    activityBuffer.push({
      type: 'page_visit',
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Listen for tab activation (user switching tabs)
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!observerMode || !userId) return;
  
  const tab = await chrome.tabs.get(activeInfo.tabId);
  activityBuffer.push({
    type: 'tab_switch',
    url: tab.url,
    title: tab.title,
    timestamp: new Date().toISOString()
  });
});

// Background service worker ready
