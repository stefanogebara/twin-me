// Soul Signature Extension Popup Controller
import { EXTENSION_CONFIG, ENVIRONMENT } from './config.js';

console.log(`[Soul Signature Popup] Running in ${ENVIRONMENT} mode`);

// Platform configuration
const PLATFORMS = {
  netflix: { name: 'Netflix', icon: '🎬' },
  disneyplus: { name: 'Disney+', icon: '✨' },
  hbomax: { name: 'HBO Max', icon: '📺' },
  primevideo: { name: 'Prime Video', icon: '📦' },
  instagram: { name: 'Instagram', icon: '📷' }
};

// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.sync.get(['platformSettings', 'authToken', 'stats']);

  const platformSettings = result.platformSettings || {};
  const authToken = result.authToken;
  const stats = result.stats || { totalCollected: 0 };

  // Update connection status
  updateConnectionStatus(!!authToken);

  // Update stats
  document.getElementById('totalCollected').textContent = stats.totalCollected || 0;

  // Update toggle switches
  let activeCount = 0;
  Object.keys(PLATFORMS).forEach(platform => {
    const isEnabled = platformSettings[platform]?.enabled !== false; // Default to enabled
    const toggle = document.querySelector(`.toggle-switch[data-platform="${platform}"]`);

    if (toggle) {
      if (isEnabled) {
        toggle.classList.add('active');
        activeCount++;
      }

      // Add click handler
      toggle.addEventListener('click', () => togglePlatform(platform, toggle));
    }
  });

  document.getElementById('activeCount').textContent = activeCount;
}

// Update connection status
function updateConnectionStatus(isConnected) {
  const statusDot = document.getElementById('connectionStatus');
  const statusText = document.getElementById('connectionText');

  if (isConnected) {
    statusDot.classList.remove('disconnected');
    statusText.textContent = 'Connected to Soul Signature';
  } else {
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Not connected - Click to authenticate';
    statusText.style.cursor = 'pointer';
    statusText.onclick = () => openAuthFlow();
  }
}

// Toggle platform on/off
async function togglePlatform(platform, toggleElement) {
  const isCurrentlyEnabled = toggleElement.classList.contains('active');
  const newState = !isCurrentlyEnabled;

  // Update UI
  if (newState) {
    toggleElement.classList.add('active');
  } else {
    toggleElement.classList.remove('active');
  }

  // Save to storage
  const result = await chrome.storage.sync.get('platformSettings');
  const platformSettings = result.platformSettings || {};

  platformSettings[platform] = {
    enabled: newState,
    lastToggled: new Date().toISOString()
  };

  await chrome.storage.sync.set({ platformSettings });

  // Update active count
  const activeToggles = document.querySelectorAll('.toggle-switch.active');
  document.getElementById('activeCount').textContent = activeToggles.length;

  // Notify background script
  chrome.runtime.sendMessage({
    type: 'PLATFORM_TOGGLED',
    platform,
    enabled: newState
  });

  console.log(`[Soul Signature] ${platform} ${newState ? 'enabled' : 'disabled'}`);
}

// Sync data now
document.getElementById('syncNow').addEventListener('click', async () => {
  const button = document.getElementById('syncNow');
  button.textContent = 'Syncing...';
  button.disabled = true;

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Detect which platform we're on
    const platform = detectPlatformFromUrl(tab.url);

    if (platform) {
      // Send collect data message to content script
      chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error:', chrome.runtime.lastError);
          button.textContent = 'Error - Try refreshing page';
          setTimeout(() => {
            button.textContent = 'Sync Data Now';
            button.disabled = false;
          }, 2000);
          return;
        }

        if (response && response.success) {
          button.textContent = 'Synced! ✓';
          setTimeout(() => {
            button.textContent = 'Sync Data Now';
            button.disabled = false;
          }, 2000);
        }
      });
    } else {
      button.textContent = 'Not on a supported platform';
      setTimeout(() => {
        button.textContent = 'Sync Data Now';
        button.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error('Sync error:', error);
    button.textContent = 'Error syncing';
    setTimeout(() => {
      button.textContent = 'Sync Data Now';
      button.disabled = false;
    }, 2000);
  }
});

// Open dashboard
document.getElementById('openDashboard').addEventListener('click', async () => {
  const button = document.getElementById('openDashboard');
  const originalText = button.textContent;

  try {
    // Check authentication status first
    const result = await chrome.storage.sync.get(['authToken']);

    if (!result.authToken) {
      // Not authenticated - show message and redirect to auth
      button.textContent = 'Please sign in first...';
      button.style.background = '#EF4444';

      setTimeout(() => {
        chrome.tabs.create({ url: `${EXTENSION_CONFIG.APP_URL}/auth` });
        button.textContent = originalText;
        button.style.background = '';
      }, 1500);
    } else {
      // Authenticated - open dashboard
      button.textContent = 'Opening dashboard...';
      chrome.tabs.create({ url: `${EXTENSION_CONFIG.APP_URL}/dashboard` });

      setTimeout(() => {
        button.textContent = originalText;
      }, 1000);
    }
  } catch (error) {
    console.error('Error opening dashboard:', error);
    button.textContent = 'Error - please try again';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  }
});

// Detect platform from URL
function detectPlatformFromUrl(url) {
  if (url.includes('netflix.com')) return 'netflix';
  if (url.includes('disneyplus.com')) return 'disneyplus';
  if (url.includes('hbomax.com') || url.includes('max.com')) return 'hbomax';
  if (url.includes('primevideo.com') || url.includes('amazon.com/gp/video')) return 'primevideo';
  if (url.includes('instagram.com')) return 'instagram';
  return null;
}

// Open authentication flow
function openAuthFlow() {
  chrome.tabs.create({ url: `${EXTENSION_CONFIG.APP_URL}/auth` });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DATA_COLLECTED') {
    // Update stats
    chrome.storage.sync.get('stats', (result) => {
      const stats = result.stats || { totalCollected: 0 };
      stats.totalCollected = (stats.totalCollected || 0) + (message.itemCount || 1);

      chrome.storage.sync.set({ stats });
      document.getElementById('totalCollected').textContent = stats.totalCollected;
    });
  }

  if (message.type === 'AUTH_STATUS_CHANGED') {
    updateConnectionStatus(message.authenticated);
  }
});

// Soul Observer Mode Toggle
document.getElementById('soulObserverToggle').addEventListener('click', async () => {
  const toggle = document.getElementById('soulObserverToggle');
  const details = document.getElementById('observerDetails');
  const isCurrentlyEnabled = toggle.classList.contains('active');
  const newState = !isCurrentlyEnabled;

  if (newState) {
    // Show confirmation dialog
    const confirmed = confirm(
      '🧠 Soul Observer Mode\n\n' +
      'This will analyze EVERYTHING you do in the browser:\n' +
      '• Typing patterns and writing style\n' +
      '• Mouse movements and clicks\n' +
      '• Reading speed and scrolling\n' +
      '• Focus and attention patterns\n' +
      '• Search and browsing habits\n' +
      '• Shopping and decision-making\n\n' +
      'All data is private and encrypted. You can disable anytime.\n\n' +
      'Enable Soul Observer Mode?'
    );

    if (!confirmed) return;

    toggle.classList.add('active');
    details.style.display = 'block';
  } else {
    toggle.classList.remove('active');
    details.style.display = 'none';
  }

  // Save to storage (use local for extension state)
  await chrome.storage.local.set({
    soulObserverEnabled: newState,
    soulObserverActivatedAt: new Date().toISOString()
  });

  // Notify all tabs
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, {
      type: newState ? 'ACTIVATE_SOUL_OBSERVER' : 'DEACTIVATE_SOUL_OBSERVER'
    }).catch(() => {
      // Tab doesn't have content script, ignore
    });
  });

  // Notify background script
  chrome.runtime.sendMessage({
    type: 'SOUL_OBSERVER_TOGGLED',
    enabled: newState
  });

  console.log(`[Soul Observer] ${newState ? 'Activated' : 'Deactivated'}`);
});

// Load Soul Observer state
async function loadSoulObserverState() {
  const result = await chrome.storage.local.get(['soulObserverEnabled']);

  if (result.soulObserverEnabled) {
    document.getElementById('soulObserverToggle').classList.add('active');
    document.getElementById('observerDetails').style.display = 'block';
  }
}

// Initialize on load
loadSettings();
loadSoulObserverState();
