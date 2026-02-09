/**
 * YouTube Content Collector
 *
 * Captures watch activity that YouTube's Data API cannot provide:
 * - Video watch sessions (play, pause, duration, completion)
 * - Search queries and result clicks
 * - Recommendation/suggested video feeds
 * - Homepage feed snapshots
 *
 * Uses MutationObserver for SPA navigation detection.
 */

(() => {
  // Skip incognito
  if (chrome.extension?.inIncognitoContext) return;

  const COLLECTOR_NAME = 'YouTube Collector';
  const FLUSH_INTERVAL_MS = 10000; // 10 seconds
  const MAX_LOCAL_EVENTS = 500;
  const HOMEPAGE_THROTTLE_MS = 30 * 60 * 1000; // 30 minutes
  const DEDUP_WINDOW_MS = 5000; // 5 seconds

  let eventBuffer = [];
  let currentVideo = null;
  let watchStartTime = null;
  let lastHomepageSnapshot = 0;
  let lastUrl = location.href;
  let recentEventKeys = new Map(); // key -> timestamp for dedup

  console.log(`[${COLLECTOR_NAME}] Initialized on ${location.href}`);

  // ============ Utility ============

  function getVideoId() {
    const params = new URLSearchParams(location.search);
    return params.get('v');
  }

  function isDuplicate(key) {
    const now = Date.now();
    const last = recentEventKeys.get(key);
    if (last && (now - last) < DEDUP_WINDOW_MS) return true;
    recentEventKeys.set(key, now);
    // Clean old keys
    if (recentEventKeys.size > 200) {
      for (const [k, t] of recentEventKeys) {
        if (now - t > DEDUP_WINDOW_MS * 2) recentEventKeys.delete(k);
      }
    }
    return false;
  }

  function bufferEvent(event) {
    eventBuffer.push({
      ...event,
      timestamp: new Date().toISOString(),
      url: location.href
    });
    // FIFO eviction
    if (eventBuffer.length > MAX_LOCAL_EVENTS) {
      eventBuffer = eventBuffer.slice(-MAX_LOCAL_EVENTS);
    }
  }

  function flushEvents() {
    if (eventBuffer.length === 0) return;

    const events = [...eventBuffer];
    eventBuffer = [];

    chrome.runtime.sendMessage({
      type: 'CAPTURE_YOUTUBE_DATA',
      data: { events }
    }, () => {
      if (chrome.runtime.lastError) {
        // Put events back if send failed
        eventBuffer = [...events, ...eventBuffer].slice(-MAX_LOCAL_EVENTS);
      }
    });
  }

  // ============ Video Watch Tracking ============

  function startWatchSession(videoId) {
    if (currentVideo === videoId && watchStartTime) return; // Already tracking

    // Finalize previous session
    finalizeWatchSession();

    const videoEl = document.querySelector('video');
    const titleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string, #title h1 yt-formatted-string');
    const channelEl = document.querySelector('ytd-video-owner-renderer #channel-name a, #owner #channel-name a');

    currentVideo = videoId;
    watchStartTime = Date.now();

    bufferEvent({
      eventType: 'video_watch',
      action: 'start',
      videoId,
      title: titleEl?.textContent?.trim() || null,
      channel: channelEl?.textContent?.trim() || null,
      duration: videoEl?.duration || null
    });
  }

  function finalizeWatchSession() {
    if (!currentVideo || !watchStartTime) return;

    const videoEl = document.querySelector('video');
    const watchDuration = (Date.now() - watchStartTime) / 1000;
    const totalDuration = videoEl?.duration || 0;
    const currentTime = videoEl?.currentTime || 0;
    const watchPercentage = totalDuration > 0 ? Math.round((currentTime / totalDuration) * 100) : 0;

    const key = `watch_end_${currentVideo}`;
    if (!isDuplicate(key)) {
      bufferEvent({
        eventType: 'video_watch',
        action: 'end',
        videoId: currentVideo,
        watchDurationSeconds: Math.round(watchDuration),
        videoDurationSeconds: Math.round(totalDuration),
        watchPercentage,
        completed: watchPercentage >= 90
      });
    }

    currentVideo = null;
    watchStartTime = null;
  }

  function setupVideoListeners() {
    const videoEl = document.querySelector('video');
    if (!videoEl || videoEl._ytCollectorBound) return;
    videoEl._ytCollectorBound = true;

    videoEl.addEventListener('pause', () => {
      if (!currentVideo) return;
      const key = `pause_${currentVideo}`;
      if (!isDuplicate(key)) {
        bufferEvent({
          eventType: 'video_watch',
          action: 'pause',
          videoId: currentVideo,
          currentTime: Math.round(videoEl.currentTime),
          duration: Math.round(videoEl.duration || 0)
        });
      }
    });

    videoEl.addEventListener('ended', () => {
      if (!currentVideo) return;
      finalizeWatchSession();
    });
  }

  // ============ Search Query Tracking ============

  function captureSearchQuery() {
    const params = new URLSearchParams(location.search);
    const query = params.get('search_query');
    if (!query) return;

    const key = `search_${query}`;
    if (isDuplicate(key)) return;

    // Count visible results
    const resultItems = document.querySelectorAll('ytd-video-renderer, ytd-channel-renderer');

    bufferEvent({
      eventType: 'search_query',
      query,
      resultCount: resultItems.length
    });
  }

  // ============ Recommendation Feed Capture ============

  function captureRecommendations() {
    const videoId = getVideoId();
    if (!videoId) return;

    // Sidebar suggested videos
    const suggestions = document.querySelectorAll('ytd-compact-video-renderer');
    if (suggestions.length === 0) return;

    const items = [];
    suggestions.forEach((el, i) => {
      if (i >= 10) return; // Only first 10
      const title = el.querySelector('#video-title')?.textContent?.trim();
      const channel = el.querySelector('#channel-name #text, .ytd-channel-name')?.textContent?.trim();
      if (title) {
        items.push({ title, channel: channel || null, position: i });
      }
    });

    if (items.length > 0) {
      const key = `recs_${videoId}_${items.length}`;
      if (!isDuplicate(key)) {
        bufferEvent({
          eventType: 'recommendation_feed',
          context: 'watch_page',
          forVideoId: videoId,
          suggestions: items
        });
      }
    }
  }

  // ============ Homepage Snapshot ============

  function captureHomepage() {
    if (location.pathname !== '/' && location.pathname !== '/feed/subscriptions') return;

    const now = Date.now();
    if (now - lastHomepageSnapshot < HOMEPAGE_THROTTLE_MS) return;
    lastHomepageSnapshot = now;

    const feedItems = document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer');
    if (feedItems.length === 0) return;

    const items = [];
    feedItems.forEach((el, i) => {
      if (i >= 20) return; // First 20 items
      const title = el.querySelector('#video-title, #video-title-link')?.textContent?.trim();
      const channel = el.querySelector('#channel-name #text, .ytd-channel-name a')?.textContent?.trim();
      if (title) {
        items.push({ title, channel: channel || null, position: i });
      }
    });

    if (items.length > 0) {
      bufferEvent({
        eventType: 'homepage_snapshot',
        context: location.pathname === '/' ? 'home' : 'subscriptions',
        itemCount: items.length,
        items
      });
    }
  }

  // ============ SPA Navigation Detection ============

  function onNavigate() {
    const newUrl = location.href;
    if (newUrl === lastUrl) return;
    lastUrl = newUrl;

    console.log(`[${COLLECTOR_NAME}] Navigation: ${newUrl}`);

    // Video page
    const videoId = getVideoId();
    if (videoId) {
      // Wait for DOM to update
      setTimeout(() => {
        startWatchSession(videoId);
        setupVideoListeners();
        // Capture recommendations after page loads
        setTimeout(captureRecommendations, 3000);
      }, 1500);
      return;
    }

    // Finalize any ongoing watch session
    finalizeWatchSession();

    // Search page
    if (location.pathname === '/results') {
      setTimeout(captureSearchQuery, 1500);
      return;
    }

    // Homepage
    if (location.pathname === '/' || location.pathname === '/feed/subscriptions') {
      setTimeout(captureHomepage, 2000);
    }
  }

  // Override history methods for SPA detection
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    setTimeout(onNavigate, 100);
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    setTimeout(onNavigate, 100);
  };

  window.addEventListener('popstate', () => setTimeout(onNavigate, 100));

  // MutationObserver for additional SPA changes
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      onNavigate();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ============ Lifecycle ============

  // Flush on beforeunload
  window.addEventListener('beforeunload', () => {
    finalizeWatchSession();
    flushEvents();
  });

  // Periodic flush
  setInterval(flushEvents, FLUSH_INTERVAL_MS);

  // Initial page handling
  setTimeout(onNavigate, 1000);
})();
