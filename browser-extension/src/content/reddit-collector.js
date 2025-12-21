/**
 * Reddit Content Collector
 * Captures subreddit visits, time spent, and engagement patterns
 */

console.log('[Reddit Collector] Initialized');

let pageStartTime = Date.now();
let currentSubreddit = null;
let scrollDepth = 0;
let postsViewed = new Set();

/**
 * Extract current subreddit
 */
function getCurrentSubreddit() {
  const match = window.location.pathname.match(/\/r\/([^\/]+)/);
  return match ? match[1] : null;
}

/**
 * Track posts viewed
 */
function trackPostViews() {
  const posts = document.querySelectorAll('[data-testid="post-container"]');

  posts.forEach(post => {
    const postId = post.getAttribute('id');
    if (!postId || postsViewed.has(postId)) return;

    const rect = post.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight) {
      postsViewed.add(postId);

      const titleElement = post.querySelector('h3');
      const subredditElement = post.querySelector('[data-click-id="subreddit"]');

      captureData('post_view', {
        postId,
        title: titleElement?.textContent,
        subreddit: subredditElement?.textContent
      });
    }
  });
}

/**
 * Monitor scroll behavior
 */
function monitorScroll() {
  window.addEventListener('scroll', () => {
    const currentDepth = Math.floor((window.scrollY / document.documentElement.scrollHeight) * 100);
    scrollDepth = Math.max(scrollDepth, currentDepth);

    trackPostViews();
  });
}

/**
 * Capture subreddit visit
 */
function captureSubredditVisit() {
  const subreddit = getCurrentSubreddit();
  if (!subreddit || subreddit === currentSubreddit) return;

  // Log previous subreddit time
  if (currentSubreddit) {
    const timeSpent = Math.floor((Date.now() - pageStartTime) / 1000);

    captureData('subreddit_exit', {
      subreddit: currentSubreddit,
      timeSpent,
      scrollDepth,
      postsViewed: postsViewed.size
    });
  }

  // Start tracking new subreddit
  currentSubreddit = subreddit;
  pageStartTime = Date.now();
  scrollDepth = 0;
  postsViewed.clear();

  captureData('subreddit_visit', {
    subreddit,
    url: window.location.href
  });
}

/**
 * Send data to background worker
 */
function captureData(eventType, data) {
  chrome.runtime.sendMessage({
    type: 'CAPTURE_REDDIT_DATA',
    data: {
      eventType,
      timestamp: new Date().toISOString(),
      ...data
    }
  });
}

/**
 * Initialize collector
 */
function initialize() {
  captureSubredditVisit();
  monitorScroll();

  // Monitor URL changes (Reddit is SPA)
  setInterval(captureSubredditVisit, 5000);

  // Track posts on initial load
  setTimeout(trackPostViews, 2000);

  // Capture on page unload
  window.addEventListener('beforeunload', () => {
    if (currentSubreddit) {
      const timeSpent = Math.floor((Date.now() - pageStartTime) / 1000);

      captureData('subreddit_exit', {
        subreddit: currentSubreddit,
        timeSpent,
        scrollDepth,
        postsViewed: postsViewed.size
      });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
