/**
 * YouTube Content Script
 * Tracks video watch events and sends data to background script
 */

console.log('[Soul Signature] YouTube tracker initialized');

// State management
let currentVideo = null;
let watchStartTime = null;
let videoPlayer = null;
let heartbeatInterval = null;

/**
 * Extract video data from current YouTube page
 */
function getVideoData() {
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) return null;

  // Get video player element
  const player = document.querySelector('video');
  if (!player) return null;

  // Extract metadata from page
  const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent || 'Unknown Title';
  const channelElement = document.querySelector('ytd-channel-name a');
  const channelName = channelElement?.textContent?.trim() || 'Unknown Channel';
  const channelUrl = channelElement?.href || '';

  return {
    videoId,
    title,
    channelName,
    channelUrl,
    url: window.location.href,
    duration: player.duration,
    currentTime: player.currentTime,
    timestamp: new Date().toISOString()
  };
}

/**
 * Start tracking a video
 */
function startTracking() {
  const videoData = getVideoData();
  if (!videoData || currentVideo === videoData.videoId) return;

  console.log('[Soul Signature] Started tracking video:', videoData.title);

  currentVideo = videoData.videoId;
  watchStartTime = Date.now();

  // Send initial watch event
  chrome.runtime.sendMessage({
    type: 'VIDEO_STARTED',
    platform: 'youtube',
    data: videoData
  });

  // Set up heartbeat to track watch progress every 30 seconds
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  heartbeatInterval = setInterval(() => {
    const player = document.querySelector('video');
    if (player && !player.paused) {
      const watchDuration = Math.floor((Date.now() - watchStartTime) / 1000);

      chrome.runtime.sendMessage({
        type: 'VIDEO_PROGRESS',
        platform: 'youtube',
        data: {
          ...videoData,
          watchDuration,
          currentTime: player.currentTime,
          percentWatched: (player.currentTime / player.duration) * 100
        }
      });
    }
  }, 30000); // Every 30 seconds
}

/**
 * Stop tracking current video
 */
function stopTracking(reason = 'ended') {
  if (!currentVideo) return;

  const player = document.querySelector('video');
  const watchDuration = Math.floor((Date.now() - watchStartTime) / 1000);

  console.log(`[Soul Signature] Stopped tracking video (${reason}):`, currentVideo, `Duration: ${watchDuration}s`);

  // Only log if watched for at least 10 seconds
  if (watchDuration >= 10) {
    chrome.runtime.sendMessage({
      type: 'VIDEO_ENDED',
      platform: 'youtube',
      data: {
        videoId: currentVideo,
        watchDuration,
        endReason: reason,
        currentTime: player?.currentTime || 0,
        percentWatched: player ? (player.currentTime / player.duration) * 100 : 0,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Clear state
  currentVideo = null;
  watchStartTime = null;
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Detect when video starts playing
 */
function observeVideoChanges() {
  // Watch for URL changes (YouTube is SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;

      // If we navigated to a new video, stop tracking old one
      if (currentVideo) {
        stopTracking('navigated_away');
      }

      // Start tracking new video if on watch page
      if (url.includes('/watch?v=')) {
        setTimeout(startTracking, 1000); // Wait for page to load
      }
    }
  }).observe(document, { subtree: true, childList: true });

  // Watch for video player events
  setInterval(() => {
    const player = document.querySelector('video');

    if (player && player !== videoPlayer) {
      videoPlayer = player;

      // Set up event listeners on video player
      player.addEventListener('play', () => {
        if (window.location.href.includes('/watch?v=')) {
          startTracking();
        }
      });

      player.addEventListener('pause', () => {
        // Don't stop tracking on pause, user might resume
      });

      player.addEventListener('ended', () => {
        stopTracking('completed');
      });
    }
  }, 1000);
}

/**
 * Extract historical watch history from YouTube feed (one-time import)
 */
async function extractHistoricalData() {
  // Check if we've already imported history
  const result = await chrome.storage.local.get(['youtubeHistoryImported']);
  if (result.youtubeHistoryImported) {
    console.log('[Soul Signature] YouTube history already imported');
    return;
  }

  // Check if we're on the history page
  if (!window.location.href.includes('/feed/history')) {
    console.log('[Soul Signature] Not on history page, skipping import');
    return;
  }

  console.log('[Soul Signature] Extracting historical watch data...');

  // Scroll to load more history items
  let lastCount = 0;
  let scrollAttempts = 0;

  while (scrollAttempts < 10) { // Limit scrolling to prevent infinite loops
    const videoElements = document.querySelectorAll('ytd-video-renderer');

    if (videoElements.length > lastCount) {
      lastCount = videoElements.length;
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for load
      scrollAttempts = 0; // Reset if we got new items
    } else {
      scrollAttempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Extract video data
  const historicalVideos = [];
  const videoElements = document.querySelectorAll('ytd-video-renderer');

  videoElements.forEach(element => {
    const titleElement = element.querySelector('#video-title');
    const channelElement = element.querySelector('#channel-name a');
    const videoUrl = titleElement?.href;
    const videoId = videoUrl ? new URL(videoUrl).searchParams.get('v') : null;

    if (videoId) {
      historicalVideos.push({
        videoId,
        title: titleElement?.textContent?.trim() || 'Unknown',
        channelName: channelElement?.textContent?.trim() || 'Unknown',
        url: videoUrl,
        timestamp: new Date().toISOString() // Note: YouTube doesn't show watch timestamps in feed
      });
    }
  });

  console.log(`[Soul Signature] Found ${historicalVideos.length} historical videos`);

  // Send to background script
  if (historicalVideos.length > 0) {
    chrome.runtime.sendMessage({
      type: 'HISTORICAL_IMPORT',
      platform: 'youtube',
      data: historicalVideos
    });

    // Mark as imported
    await chrome.storage.local.set({ youtubeHistoryImported: true });
  }
}

// Initialize tracking when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    observeVideoChanges();
  });
} else {
  observeVideoChanges();
}

// Start tracking if already on a video page
if (window.location.href.includes('/watch?v=')) {
  setTimeout(startTracking, 2000);
}

// Check if user wants to import history
chrome.storage.local.get(['enableHistoryImport'], (result) => {
  if (result.enableHistoryImport && window.location.href.includes('/feed/history')) {
    extractHistoricalData();
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (currentVideo) {
    stopTracking('page_unload');
  }
});
