/**
 * YouTube Content Collector
 * Enhances API data with watch time, scroll behavior, and engagement patterns
 */

console.log('[YouTube Collector] Initialized');

let videoStartTime = null;
let currentVideoId = null;
let watchSessions = {};

/**
 * Extract video ID from URL
 */
function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

/**
 * Get video metadata
 */
function getVideoMetadata() {
  const videoId = getVideoId();
  if (!videoId) return null;

  const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer');
  const channelElement = document.querySelector('ytd-channel-name a');
  const video = document.querySelector('video');

  return {
    videoId,
    title: titleElement?.textContent?.trim(),
    channel: channelElement?.textContent?.trim(),
    channelUrl: channelElement?.href,
    duration: video?.duration,
    currentTime: video?.currentTime,
    url: window.location.href,
    timestamp: new Date().toISOString()
  };
}

/**
 * Track video watch time
 */
function monitorVideo() {
  const video = document.querySelector('video');
  if (!video || video.hasAttribute('data-monitored')) return;

  video.setAttribute('data-monitored', 'true');
  const videoId = getVideoId();

  video.addEventListener('play', () => {
    currentVideoId = videoId;
    videoStartTime = Date.now();

    const metadata = getVideoMetadata();
    captureData('video_play', metadata);
  });

  video.addEventListener('pause', () => {
    if (videoStartTime && currentVideoId === videoId) {
      const watchDuration = Math.floor((Date.now() - videoStartTime) / 1000);
      const metadata = getVideoMetadata();

      captureData('video_pause', {
        ...metadata,
        watchDuration,
        watchPercentage: Math.floor((video.currentTime / video.duration) * 100)
      });
    }
  });

  video.addEventListener('ended', () => {
    if (videoStartTime) {
      const watchDuration = Math.floor((Date.now() - videoStartTime) / 1000);
      const metadata = getVideoMetadata();

      captureData('video_complete', {
        ...metadata,
        watchDuration,
        completed: true
      });

      videoStartTime = null;
    }
  });
}

/**
 * Monitor scroll behavior and engagement
 */
function monitorEngagement() {
  let scrollDepth = 0;
  let commentsViewed = false;

  window.addEventListener('scroll', () => {
    const currentScroll = Math.floor((window.scrollY / document.documentElement.scrollHeight) * 100);
    scrollDepth = Math.max(scrollDepth, currentScroll);

    // Check if scrolled to comments
    const commentsSection = document.querySelector('#comments');
    if (commentsSection && !commentsViewed) {
      const rect = commentsSection.getBoundingClientRect();
      if (rect.top < window.innerHeight) {
        commentsViewed = true;
      }
    }
  });

  // Capture on page unload
  window.addEventListener('beforeunload', () => {
    if (scrollDepth > 20 || commentsViewed) {
      const metadata = getVideoMetadata();
      captureData('engagement', {
        ...metadata,
        scrollDepth,
        commentsViewed
      });
    }
  });
}

/**
 * Send data to background worker
 */
function captureData(eventType, data) {
  if (!data || !data.videoId) return;

  chrome.runtime.sendMessage({
    type: 'CAPTURE_YOUTUBE_DATA',
    data: {
      eventType,
      ...data
    }
  });
}

/**
 * Initialize collector
 */
function initialize() {
  // Monitor video element
  const observer = new MutationObserver(() => {
    monitorVideo();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  monitorVideo();
  monitorEngagement();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
