/**
 * Netflix Content Collector
 * Captures viewing history, watch time, genres, and content preferences
 */

console.log('[Netflix Collector] Initialized');

// Configuration
const CAPTURE_INTERVAL = 60000; // Check every minute
const MIN_WATCH_TIME = 30000; // Minimum 30 seconds to count as "watched"

// State
let currentVideo = null;
let watchStartTime = null;
let videoMetadata = {};

/**
 * Extract video title from Netflix player
 */
function extractVideoTitle() {
  // Netflix uses multiple selectors for titles
  const titleSelectors = [
    '.video-title h4',
    '.video-title',
    '[data-uia="video-title"]',
    '.watch-video--player-view h4',
    '.PlayerControlsNeo__layout h4'
  ];

  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }

  // Fallback to page title
  const pageTitle = document.title;
  if (pageTitle && !pageTitle.includes('Netflix')) {
    return pageTitle.replace(' - Netflix', '').trim();
  }

  return null;
}

/**
 * Extract episode/season information
 */
function extractEpisodeInfo() {
  const selectors = [
    '[data-uia="video-title"]',
    '.video-title'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const text = element.textContent;
      const episodeMatch = text.match(/S(\d+):E(\d+)/i);
      if (episodeMatch) {
        return {
          season: parseInt(episodeMatch[1]),
          episode: parseInt(episodeMatch[2])
        };
      }
    }
  }

  return null;
}

/**
 * Extract genre/category information
 */
function extractGenres() {
  const genres = [];
  const genreElements = document.querySelectorAll('.meta-item, [class*="genre"]');

  genreElements.forEach(el => {
    const text = el.textContent.trim();
    if (text && text.length < 30) { // Avoid long descriptions
      genres.push(text);
    }
  });

  return genres;
}

/**
 * Get current video player element
 */
function getVideoElement() {
  return document.querySelector('video');
}

/**
 * Calculate watch time percentage
 */
function getWatchPercentage() {
  const video = getVideoElement();
  if (!video || !video.duration) return 0;

  return Math.floor((video.currentTime / video.duration) * 100);
}

/**
 * Extract all available metadata
 */
function extractMetadata() {
  const title = extractVideoTitle();
  const episodeInfo = extractEpisodeInfo();
  const genres = extractGenres();
  const video = getVideoElement();

  const metadata = {
    title,
    type: episodeInfo ? 'episode' : 'movie',
    ...episodeInfo,
    genres,
    url: window.location.href,
    timestamp: new Date().toISOString()
  };

  if (video) {
    metadata.duration = video.duration;
    metadata.currentTime = video.currentTime;
    metadata.watchPercentage = getWatchPercentage();
  }

  return metadata;
}

/**
 * Send data to background service worker
 */
function captureData(eventType, additionalData = {}) {
  const metadata = extractMetadata();

  if (!metadata.title) {
    console.log('[Netflix Collector] No title found, skipping capture');
    return;
  }

  const data = {
    eventType,
    ...metadata,
    ...additionalData
  };

  console.log('[Netflix Collector] Capturing data:', data);

  chrome.runtime.sendMessage({
    type: 'CAPTURE_NETFLIX_DATA',
    data
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Netflix Collector] Error sending message:', chrome.runtime.lastError);
    } else {
      console.log('[Netflix Collector] Data sent successfully');
    }
  });
}

/**
 * Monitor video playback
 */
function monitorPlayback() {
  const video = getVideoElement();

  if (!video) {
    console.log('[Netflix Collector] No video element found');
    return;
  }

  // Video started playing
  video.addEventListener('play', () => {
    const metadata = extractMetadata();
    console.log('[Netflix Collector] Video started:', metadata.title);

    watchStartTime = Date.now();
    currentVideo = metadata;

    captureData('video_start', {
      watchStartedAt: new Date().toISOString()
    });
  });

  // Video paused
  video.addEventListener('pause', () => {
    if (watchStartTime) {
      const watchDuration = Date.now() - watchStartTime;

      if (watchDuration >= MIN_WATCH_TIME) {
        captureData('video_pause', {
          watchDuration: Math.floor(watchDuration / 1000),
          watchPercentage: getWatchPercentage()
        });
      }
    }
  });

  // Video ended
  video.addEventListener('ended', () => {
    if (watchStartTime) {
      const watchDuration = Date.now() - watchStartTime;

      captureData('video_complete', {
        watchDuration: Math.floor(watchDuration / 1000),
        watchPercentage: 100,
        completedAt: new Date().toISOString()
      });

      watchStartTime = null;
      currentVideo = null;
    }
  });

  // Periodic progress tracking (every 2 minutes while playing)
  setInterval(() => {
    if (!video.paused && watchStartTime) {
      const watchDuration = Date.now() - watchStartTime;

      if (watchDuration >= MIN_WATCH_TIME) {
        captureData('video_progress', {
          watchDuration: Math.floor(watchDuration / 1000),
          watchPercentage: getWatchPercentage()
        });
      }
    }
  }, 120000); // Every 2 minutes
}

/**
 * Observe DOM changes to detect video player injection
 */
function observeVideoPlayer() {
  const observer = new MutationObserver((mutations) => {
    const video = getVideoElement();

    if (video && !video.hasAttribute('data-monitored')) {
      console.log('[Netflix Collector] Video player detected');
      video.setAttribute('data-monitored', 'true');
      monitorPlayback();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Try to monitor immediately if video is already present
  const video = getVideoElement();
  if (video) {
    monitorPlayback();
  }
}

/**
 * Capture browsing activity (even without playing)
 */
function captureBrowsingActivity() {
  const url = window.location.href;

  if (url.includes('/watch/') || url.includes('/title/')) {
    const metadata = extractMetadata();

    if (metadata.title) {
      captureData('page_view', {
        viewedAt: new Date().toISOString()
      });
    }
  }
}

// Initialize collector
function initialize() {
  console.log('[Netflix Collector] Starting initialization...');

  // Monitor video playback
  observeVideoPlayer();

  // Capture browsing activity on page load
  setTimeout(captureBrowsingActivity, 3000);

  // Periodic checks
  setInterval(captureBrowsingActivity, CAPTURE_INTERVAL);

  console.log('[Netflix Collector] Initialization complete');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
