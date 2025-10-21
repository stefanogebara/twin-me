/**
 * Soul Observer Mode Content Script
 * Intelligently tracks browsing activity for LLM interpretation
 * 
 * Privacy-first design:
 * - User must explicitly enable
 * - Only captures metadata (no form data, passwords, etc.)
 * - Transparent about what's collected
 * - Data encrypted before sending
 */

console.log('[Soul Observer] Content script loaded');

let observerEnabled = false;
let lastActivityTime = Date.now();
let currentPageData = {
  startTime: Date.now(),
  scrollDepth: 0,
  interactions: 0,
  readingTime: 0
};

// Check if observer mode is enabled
chrome.storage.local.get(['observerMode'], (result) => {
  observerEnabled = result.observerMode || false;
  if (observerEnabled) {
    console.log('[Soul Observer] Observer mode ENABLED');
    initializeObserver();
  } else {
    console.log('[Soul Observer] Observer mode DISABLED');
  }
});

/**
 * Initialize activity observers
 */
function initializeObserver() {
  // Track scroll depth
  let maxScroll = 0;
  window.addEventListener('scroll', () => {
    const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    maxScroll = Math.max(maxScroll, scrollPercent);
    currentPageData.scrollDepth = Math.round(maxScroll);
    updateActivityTime();
  }, { passive: true });
  
  // Track clicks (interests, engagement)
  document.addEventListener('click', (e) => {
    currentPageData.interactions++;
    
    // Capture click context (but not sensitive data)
    const clickData = {
      type: 'click',
      element: e.target.tagName,
      text: e.target.textContent?.substring(0, 100) || '', // Limit text length
      href: e.target.href || null,
      timestamp: Date.now()
    };
    
    sendActivity(clickData);
    updateActivityTime();
  }, { passive: true });
  
  // Track reading time
  setInterval(() => {
    if (Date.now() - lastActivityTime < 30000) { // Active in last 30 seconds
      currentPageData.readingTime += 1; // Increment by 1 second
    }
  }, 1000);
  
  // Track media playback
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    video.addEventListener('play', () => {
      sendActivity({
        type: 'video_play',
        duration: video.duration,
        currentTime: video.currentTime,
        src: video.src || video.currentSrc
      });
    });
    
    video.addEventListener('pause', () => {
      sendActivity({
        type: 'video_pause',
        currentTime: video.currentTime,
        watchedPercent: (video.currentTime / video.duration) * 100
      });
    });
  });
  
  // Detect content type
  detectContentType();
  
  // Send page summary on visibility change (user leaving page)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      sendPageSummary();
    }
  });
  
  // Send summary on unload
  window.addEventListener('beforeunload', () => {
    sendPageSummary();
  });
}

/**
 * Detect content type for intelligent categorization
 */
function detectContentType() {
  const url = window.location.href;
  const title = document.title;
  const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
  const headings = Array.from(document.querySelectorAll('h1, h2'))
    .map(h => h.textContent)
    .join(' ')
    .substring(0, 500);
  
  // Categorize content
  let category = 'general';
  const categories = {
    'social': ['facebook', 'twitter', 'linkedin', 'instagram', 'reddit'],
    'video': ['youtube', 'vimeo', 'netflix', 'hulu', 'primevideo', 'disneyplus'],
    'news': ['news', 'article', 'blog', 'medium'],
    'shopping': ['amazon', 'ebay', 'shop', 'store', 'cart'],
    'entertainment': ['game', 'music', 'spotify', 'soundcloud'],
    'productivity': ['docs', 'gmail', 'calendar', 'notion', 'trello'],
    'learning': ['course', 'tutorial', 'learn', 'education', 'wikipedia']
  };
  
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => url.toLowerCase().includes(kw) || title.toLowerCase().includes(kw))) {
      category = cat;
      break;
    }
  }
  
  sendActivity({
    type: 'page_load',
    category,
    title,
    description: metaDescription.substring(0, 200),
    headings: headings.substring(0, 300),
    url: sanitizeUrl(url)
  });
}

/**
 * Send activity to background script
 */
function sendActivity(activity) {
  if (!observerEnabled) return;
  
  chrome.runtime.sendMessage({
    type: 'BROWSING_ACTIVITY',
    data: {
      ...activity,
      url: sanitizeUrl(window.location.href),
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Send page summary
 */
function sendPageSummary() {
  if (!observerEnabled) return;
  
  const timeSpent = Date.now() - currentPageData.startTime;
  
  sendActivity({
    type: 'page_summary',
    timeSpent: Math.round(timeSpent / 1000), // seconds
    scrollDepth: currentPageData.scrollDepth,
    interactions: currentPageData.interactions,
    readingTime: currentPageData.readingTime,
    engaged: currentPageData.readingTime > 10 || currentPageData.interactions > 3
  });
  
  // Reset for next page
  currentPageData = {
    startTime: Date.now(),
    scrollDepth: 0,
    interactions: 0,
    readingTime: 0
  };
}

/**
 * Sanitize URL (remove query params that might contain sensitive data)
 */
function sanitizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Keep only the origin and pathname, remove query params and hash
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch (e) {
    return url;
  }
}

/**
 * Update last activity time
 */
function updateActivityTime() {
  lastActivityTime = Date.now();
}

/**
 * Listen for observer mode toggle
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OBSERVER_MODE_CHANGED') {
    observerEnabled = message.enabled;
    if (observerEnabled && !observerInitialized) {
      initializeObserver();
      observerInitialized = true;
    }
    sendResponse({ success: true });
  }
});

let observerInitialized = false;
