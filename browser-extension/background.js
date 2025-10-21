/**
 * Soul Signature Browser Extension - Background Service Worker
 * Handles data collection, API communication, and LLM interpretation
 */

// Configuration
const API_BASE_URL = 'http://localhost:3001/api';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

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
  console.log('[Background] Received message:', message.type);
  
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
        // Mark as synced
        const updatedData = netflixData.map(d => 
          unsyncedNetflix.includes(d) ? { ...d, synced: true } : d
        );
        await chrome.storage.local.set({ netflixData: updatedData });
        console.log('[Background] Netflix data synced successfully');
      }
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
  const { netflixData = [] } = await chrome.storage.local.get('netflixData');
  const unsyncedCount = netflixData.filter(d => !d.synced).length + activityBuffer.length;
  
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

console.log('[Soul Signature] Background service worker loaded');
