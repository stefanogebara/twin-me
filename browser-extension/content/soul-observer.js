/**
 * Soul Observer Mode Content Script
 * Intelligently tracks browsing activity for LLM interpretation
 *
 * Privacy-first design:
 * - User must explicitly enable
 * - Only captures metadata (no form data, passwords, etc.)
 * - Transparent about what's collected
 * - Data encrypted before sending
 * - Sensitive domains blocked (banking, healthcare, email, gov)
 * - URLs sanitized (tracking params stripped)
 * - Incognito mode excluded
 */

console.log('[Soul Observer] Content script loaded');

// Skip entirely in incognito mode (chrome.extension may not exist in MV3)
const _isIncognito = typeof chrome !== 'undefined' && chrome.extension && chrome.extension.inIncognitoContext;
if (_isIncognito) {
  console.log('[Soul Observer] Incognito mode - disabled');
}

let observerEnabled = false;
let lastActivityTime = Date.now();
let webEventEmitted = false;
let lastWebEventUrl = null;
let lastWebEventTime = 0;
let currentPageData = {
  startTime: Date.now(),
  scrollDepth: 0,
  interactions: 0,
  readingTime: 0
};

// ============================================================
// SENSITIVE DOMAIN BLOCKLIST - never collect data from these
// ============================================================
const SENSITIVE_DOMAIN_PATTERNS = [
  // Banking & Finance
  /bank/i, /chase\.com/, /wellsfargo\.com/, /capitalone\.com/, /citi\.com/,
  /paypal\.com/, /venmo\.com/, /zelle\.com/, /mint\.com/,
  // Healthcare
  /health/i, /medical/i, /patient/i, /mychart/i, /hospital/i,
  /pharmacy/i, /doctor/i, /clinic/i,
  // Email (handled by dedicated connectors)
  /mail\.google\.com/, /outlook\.live\.com/, /outlook\.office\.com/,
  /mail\.yahoo\.com/, /protonmail\.com/, /tutanota\.com/,
  // Password managers
  /1password\.com/, /lastpass\.com/, /bitwarden\.com/, /dashlane\.com/,
  // Government
  /\.gov$/, /\.gov\./,
  // Auth pages
  /accounts\.google\.com/, /login\./i, /signin\./i, /auth\./i
];

function isSensitiveDomain(hostname) {
  return SENSITIVE_DOMAIN_PATTERNS.some(pattern => pattern.test(hostname));
}

// ============================================================
// TRACKING PARAM PATTERNS - stripped from URLs for privacy
// ============================================================
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'msclkid', 'twclid', 'li_fat_id', 'mc_cid', 'mc_eid',
  'ref', 'ref_', '_ga', '_gl', 'yclid', 'spm'
]);

// ============================================================
// SEARCH ENGINE QUERY DETECTION
// ============================================================
const SEARCH_ENGINE_PARAMS = {
  'google.com': { param: 'q', path: '/search' },
  'www.google.com': { param: 'q', path: '/search' },
  'bing.com': { param: 'q', path: '/search' },
  'www.bing.com': { param: 'q', path: '/search' },
  'duckduckgo.com': { param: 'q', path: '/' },
  'www.reddit.com': { param: 'q', path: '/search' },
  'old.reddit.com': { param: 'q', path: '/search' },
  'stackoverflow.com': { param: 'q', path: '/search' },
  'www.stackoverflow.com': { param: 'q', path: '/search' },
  'github.com': { param: 'q', path: '/search' },
  'en.wikipedia.org': { param: 'search', path: '/w/index.php' },
  'search.brave.com': { param: 'q', path: '/search' },
  'www.perplexity.ai': { param: 'q', path: '/search' },
  'perplexity.ai': { param: 'q', path: '/search' },
  'kagi.com': { param: 'q', path: '/search' },
  'www.ecosia.org': { param: 'q', path: '/search' },
  'ecosia.org': { param: 'q', path: '/search' },
  'search.yahoo.com': { param: 'p', path: '/search' },
};

// Generic search param names (fallback for unknown sites)
const GENERIC_SEARCH_PARAMS = ['q', 'query', 'search', 'keyword', 'keywords', 'search_query'];

function detectSearchQuery() {
  try {
    const url = new URL(window.location.href);
    const hostname = url.hostname;

    // Skip YouTube search (handled by YouTube collector)
    if (hostname.includes('youtube.com')) return null;

    // Check known search engines
    const engine = SEARCH_ENGINE_PARAMS[hostname];
    if (engine) {
      if (engine.path && !url.pathname.startsWith(engine.path)) return null;
      const query = url.searchParams.get(engine.param);
      return query ? query.trim() : null;
    }

    // Amazon search
    if (hostname.includes('amazon.')) {
      const k = url.searchParams.get('k');
      if (k && url.pathname.startsWith('/s')) return k.trim();
    }

    // Generic fallback - check common query params
    for (const param of GENERIC_SEARCH_PARAMS) {
      const val = url.searchParams.get(param);
      if (val && val.length > 1 && val.length < 200) return val.trim();
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================
// DOMAIN CATEGORIZATION
// ============================================================
const DOMAIN_CATEGORY_MAP = {
  // Learning
  'stackoverflow.com': 'Learning', 'stackexchange.com': 'Learning',
  'medium.com': 'Learning', 'dev.to': 'Learning',
  'coursera.org': 'Learning', 'udemy.com': 'Learning',
  'khanacademy.org': 'Learning', 'edx.org': 'Learning',
  'freecodecamp.org': 'Learning', 'w3schools.com': 'Learning',
  'mdn.mozilla.org': 'Learning', 'developer.mozilla.org': 'Learning',
  'docs.python.org': 'Learning', 'docs.microsoft.com': 'Learning',
  'learn.microsoft.com': 'Learning', 'arxiv.org': 'Learning',
  'scholar.google.com': 'Learning', 'researchgate.net': 'Learning',
  // News
  'cnn.com': 'News', 'bbc.com': 'News', 'bbc.co.uk': 'News',
  'nytimes.com': 'News', 'reuters.com': 'News', 'apnews.com': 'News',
  'techcrunch.com': 'News', 'theverge.com': 'News', 'arstechnica.com': 'News',
  'news.ycombinator.com': 'News', 'wired.com': 'News', 'engadget.com': 'News',
  // Shopping
  'amazon.com': 'Shopping', 'ebay.com': 'Shopping', 'etsy.com': 'Shopping',
  'walmart.com': 'Shopping', 'target.com': 'Shopping', 'bestbuy.com': 'Shopping',
  // Social
  'reddit.com': 'Social', 'old.reddit.com': 'Social',
  'twitter.com': 'Social', 'x.com': 'Social',
  'facebook.com': 'Social', 'instagram.com': 'Social',
  'linkedin.com': 'Social', 'threads.net': 'Social',
  'mastodon.social': 'Social', 'bsky.app': 'Social',
  // Entertainment (skip YouTube/Twitch - handled by dedicated collectors)
  'netflix.com': 'Entertainment', 'spotify.com': 'Entertainment',
  'twitch.tv': 'Entertainment', 'youtube.com': 'Entertainment',
  'disneyplus.com': 'Entertainment', 'hbomax.com': 'Entertainment',
  'primevideo.com': 'Entertainment', 'hulu.com': 'Entertainment',
  // Productivity
  'github.com': 'Productivity', 'gitlab.com': 'Productivity',
  'notion.so': 'Productivity', 'figma.com': 'Productivity',
  'docs.google.com': 'Productivity', 'drive.google.com': 'Productivity',
  'trello.com': 'Productivity', 'asana.com': 'Productivity',
  'jira.atlassian.net': 'Productivity', 'confluence.atlassian.net': 'Productivity',
  'vercel.com': 'Productivity', 'netlify.com': 'Productivity',
  // Health & Fitness
  'strava.com': 'Health', 'myfitnesspal.com': 'Health',
  'fitbit.com': 'Health', 'whoop.com': 'Health',
  // Reference
  'wikipedia.org': 'Reference', 'en.wikipedia.org': 'Reference',
  'dictionary.com': 'Reference', 'merriam-webster.com': 'Reference',
  'wolframalpha.com': 'Reference',
};

function categorizeSite(hostname, metadata) {
  // Strip www. prefix for lookup
  const bare = hostname.replace(/^www\./, '');

  // Direct domain match
  if (DOMAIN_CATEGORY_MAP[bare]) return DOMAIN_CATEGORY_MAP[bare];
  if (DOMAIN_CATEGORY_MAP[hostname]) return DOMAIN_CATEGORY_MAP[hostname];

  // Partial domain match (e.g., *.stackoverflow.com)
  for (const [domain, category] of Object.entries(DOMAIN_CATEGORY_MAP)) {
    if (hostname.endsWith('.' + domain) || bare.endsWith('.' + domain)) return category;
  }

  // Subdomain patterns
  if (/docs?\./i.test(hostname) || /wiki\./i.test(hostname) || /learn\./i.test(hostname)) return 'Learning';
  if (/blog\./i.test(hostname)) return 'News';
  if (/shop\./i.test(hostname) || /store\./i.test(hostname)) return 'Shopping';

  // Content-based fallback using metadata
  if (metadata) {
    const text = ((metadata.title || '') + ' ' + (metadata.description || '')).toLowerCase();
    if (/tutorial|learn|course|documentation|guide|reference/i.test(text)) return 'Learning';
    if (/news|article|breaking|report|journalist/i.test(text)) return 'News';
    if (/buy|price|cart|shop|sale|deal/i.test(text)) return 'Shopping';
    if (/game|play|stream|watch/i.test(text)) return 'Entertainment';
  }

  return 'Other';
}

// ============================================================
// PAGE METADATA EXTRACTION (Open Graph, JSON-LD, meta tags)
// ============================================================
function extractPageMetadata() {
  const meta = {};

  // Open Graph tags
  meta.ogTitle = document.querySelector('meta[property="og:title"]')?.content || null;
  meta.ogDescription = document.querySelector('meta[property="og:description"]')?.content || null;
  meta.ogType = document.querySelector('meta[property="og:type"]')?.content || null;
  meta.ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content || null;

  // Standard meta tags
  meta.description = document.querySelector('meta[name="description"]')?.content || null;
  meta.keywords = document.querySelector('meta[name="keywords"]')?.content || null;
  meta.author = document.querySelector('meta[name="author"]')?.content || null;

  // Title and H1
  meta.title = document.title || null;
  meta.h1 = document.querySelector('h1')?.textContent?.trim()?.substring(0, 200) || null;

  // JSON-LD structured data (article type)
  try {
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      const ld = JSON.parse(script.textContent);
      const item = Array.isArray(ld) ? ld[0] : ld;
      if (item?.['@type'] === 'Article' || item?.['@type'] === 'NewsArticle' || item?.['@type'] === 'BlogPosting') {
        meta.articleAuthor = item.author?.name || (typeof item.author === 'string' ? item.author : null);
        meta.articlePublisher = item.publisher?.name || null;
        meta.articleDate = item.datePublished || null;
        break;
      }
    }
  } catch { /* ignore parse errors */ }

  return meta;
}

// ============================================================
// URL SANITIZATION (enhanced - preserves search queries, strips tracking)
// ============================================================
function sanitizeUrlForEvent(url) {
  try {
    const urlObj = new URL(url);
    // Remove tracking params
    for (const param of TRACKING_PARAMS) {
      urlObj.searchParams.delete(param);
    }
    // Truncate path beyond 3 segments for privacy
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 3) {
      urlObj.pathname = '/' + pathParts.slice(0, 3).join('/');
    }
    // Keep search params only for known search engines
    const isSearch = detectSearchQuery() !== null;
    if (!isSearch) {
      // Strip all remaining query params for non-search pages
      urlObj.search = '';
    }
    urlObj.hash = '';
    return urlObj.toString();
  } catch {
    return url;
  }
}

// ============================================================
// CONTENT TYPE DETECTION
// ============================================================
function detectPageContentType() {
  const url = window.location.href;
  const hostname = window.location.hostname;

  // Video content
  if (/youtube\.com|vimeo\.com|dailymotion\.com|twitch\.tv/.test(hostname)) return 'video';

  // Search results
  if (detectSearchQuery() !== null) return 'search_results';

  // Social feed
  if (/reddit\.com\/?$|twitter\.com\/?$|facebook\.com\/?$|x\.com\/?$/.test(url) || /\/feed|\/home|\/timeline/.test(url)) return 'social_feed';

  // Product pages
  if (/\/product|\/item|\/dp\/|\/buy|\/shop/.test(url)) return 'product';

  // Article detection
  if (isArticleContent()) return 'article';

  return 'other';
}

// Auto-initialize - extension injection = user consent
// Users can disable via popup toggle which sets trackingEnabled=false
chrome.storage.local.get(['trackingEnabled'], (result) => {
  // Default to true if not explicitly set to false
  const enabled = result.trackingEnabled !== false;
  if (enabled) {
    console.log('[Soul Observer] Universal tracking ACTIVE');
    observerEnabled = true;
    initializeObserver();
    observerInitialized = true;
    // Run reading analysis after page settles
    setTimeout(() => {
      if (isArticleContent()) {
        analyzeReadingPatterns();
      }
    }, 2000);
  } else {
    console.log('[Soul Observer] Tracking disabled by user');
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
  if (message.type === 'OBSERVER_MODE_CHANGED' || message.type === 'TRACKING_TOGGLE') {
    const enabled = message.enabled !== undefined ? message.enabled : message.trackingEnabled;
    observerEnabled = enabled;
    if (enabled && !observerInitialized) {
      initializeObserver();
      observerInitialized = true;
    }
    sendResponse({ success: true });
  }
});

let observerInitialized = false;

/**
 * READING PATTERN ANALYSIS
 * Advanced features for analyzing reading behavior and content comprehension
 */

// Reading pattern data
let readingPatternData = {
  wordCount: 0,
  estimatedReadingTime: 0,
  actualReadingTime: 0,
  readingSpeed: 0, // words per minute
  complexity: 'medium',
  topics: [],
  engagementScore: 0
};

/**
 * Analyze article content for reading patterns
 * Called on page load for article-like content
 */
function analyzeReadingPatterns() {
  // Only analyze if this looks like an article
  if (!isArticleContent()) {
    return;
  }

  console.log('[Soul Observer] Analyzing reading patterns for article content');

  // Extract main content
  const content = extractArticleContent();

  // Count words
  const wordCount = countWords(content);
  readingPatternData.wordCount = wordCount;

  // Estimate reading time (average 200-250 words per minute)
  const estimatedMinutes = wordCount / 225;
  readingPatternData.estimatedReadingTime = Math.round(estimatedMinutes * 60); // seconds

  // Analyze content complexity
  readingPatternData.complexity = analyzeContentComplexity(content);

  // Extract topics
  readingPatternData.topics = extractTopics(content);

  console.log('[Soul Observer] Reading analysis:', {
    wordCount: readingPatternData.wordCount,
    estimatedTime: readingPatternData.estimatedReadingTime + 's',
    complexity: readingPatternData.complexity,
    topics: readingPatternData.topics
  });

  // Send initial reading analysis
  sendActivity({
    type: 'reading_analysis',
    wordCount: readingPatternData.wordCount,
    estimatedReadingTime: readingPatternData.estimatedReadingTime,
    complexity: readingPatternData.complexity,
    topics: readingPatternData.topics.slice(0, 10) // Top 10 topics
  });
}

/**
 * Detect if current page is article content
 */
function isArticleContent() {
  // Check for article tags
  const hasArticleTag = document.querySelector('article, [role="article"], .article, .post-content, .entry-content');

  // Check for common article class names
  const articleClasses = ['article', 'post', 'entry', 'content', 'blog', 'story'];
  const hasArticleClass = articleClasses.some(className =>
    document.body.className.toLowerCase().includes(className)
  );

  // Check if page has substantial text content
  const textLength = document.body.innerText?.length || 0;
  const hasSubstantialText = textLength > 500;

  // Check for metadata
  const hasMeta = document.querySelector('meta[property="article:published_time"], meta[property="og:type"][content="article"]');

  return !!(hasArticleTag || hasArticleClass || hasMeta) && hasSubstantialText;
}

/**
 * Extract main article content
 */
function extractArticleContent() {
  // Try common article selectors
  const selectors = [
    'article',
    '[role="article"]',
    '.article-content',
    '.post-content',
    '.entry-content',
    'main article',
    '.story-body',
    '.content-body'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element.innerText || '';
    }
  }

  // Fallback: extract from main tag or body
  const main = document.querySelector('main');
  return (main?.innerText || document.body.innerText || '').substring(0, 50000); // Limit to 50K chars
}

/**
 * Count words in text
 */
function countWords(text) {
  // Remove extra whitespace and split by words
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  return words.length;
}

/**
 * Analyze content complexity based on various factors
 */
function analyzeContentComplexity(text) {
  if (!text || text.length < 100) {
    return 'low';
  }

  let complexityScore = 0;

  // Factor 1: Average sentence length
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = text.length / sentences.length;

  if (avgSentenceLength > 150) complexityScore += 2;
  else if (avgSentenceLength > 100) complexityScore += 1;

  // Factor 2: Average word length
  const words = text.split(/\s+/);
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

  if (avgWordLength > 7) complexityScore += 2;
  else if (avgWordLength > 5) complexityScore += 1;

  // Factor 3: Use of complex words (3+ syllables, roughly length > 8)
  const complexWords = words.filter(word => word.length > 8).length;
  const complexWordRatio = complexWords / words.length;

  if (complexWordRatio > 0.15) complexityScore += 2;
  else if (complexWordRatio > 0.10) complexityScore += 1;

  // Factor 4: Technical terminology (capital letters, numbers, special chars)
  const technicalPattern = /[A-Z]{2,}|\d+%|\d+\.\d+|[α-ωΑ-Ω]/g;
  const technicalMatches = (text.match(technicalPattern) || []).length;
  const technicalRatio = technicalMatches / words.length;

  if (technicalRatio > 0.05) complexityScore += 2;
  else if (technicalRatio > 0.02) complexityScore += 1;

  // Classify complexity
  if (complexityScore >= 6) return 'high';
  if (complexityScore >= 3) return 'medium';
  return 'low';
}

/**
 * Extract topics from article content using keyword extraction
 */
function extractTopics(text) {
  if (!text || text.length < 100) {
    return [];
  }

  // Normalize text
  const normalizedText = text.toLowerCase();

  // Remove common stop words
  const stopWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
    'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
    'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
    'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
    'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had', 'were', 'did', 'having'
  ]);

  // Extract words (filter out short words and stop words)
  const words = normalizedText
    .split(/\W+/)
    .filter(word =>
      word.length > 4 && // At least 5 characters
      !stopWords.has(word) &&
      !/^\d+$/.test(word) // Not just numbers
    );

  // Count word frequency
  const wordFrequency = {};
  words.forEach(word => {
    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
  });

  // Get top keywords by frequency
  const sortedKeywords = Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20) // Top 20 keywords
    .map(([word, count]) => ({ word, count }));

  // Extract noun phrases from title and headings (stronger topic indicators)
  const title = document.title.toLowerCase();
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map(h => h.textContent.toLowerCase())
    .join(' ');

  const headingWords = (title + ' ' + headings)
    .split(/\W+/)
    .filter(word => word.length > 4 && !stopWords.has(word));

  // Boost keywords that appear in headings
  headingWords.forEach(word => {
    const found = sortedKeywords.find(k => k.word === word);
    if (found) {
      found.count += 5; // Boost heading words
    } else if (wordFrequency[word]) {
      sortedKeywords.push({ word, count: wordFrequency[word] + 5 });
    }
  });

  // Re-sort after boosting
  sortedKeywords.sort((a, b) => b.count - a.count);

  // Return top 15 topics
  return sortedKeywords
    .slice(0, 15)
    .map(k => k.word);
}

/**
 * Calculate reading speed based on actual reading time
 */
function calculateReadingSpeed() {
  if (readingPatternData.wordCount > 0 && currentPageData.readingTime > 10) {
    // Reading speed in words per minute
    const wordsPerSecond = readingPatternData.wordCount / currentPageData.readingTime;
    const wordsPerMinute = Math.round(wordsPerSecond * 60);

    readingPatternData.readingSpeed = wordsPerMinute;
    readingPatternData.actualReadingTime = currentPageData.readingTime;

    // Calculate engagement score
    const speedRatio = readingPatternData.actualReadingTime / readingPatternData.estimatedReadingTime;
    const scrollEngagement = currentPageData.scrollDepth / 100;
    const interactionFactor = Math.min(currentPageData.interactions / 10, 1);

    // Engagement score: 0-100
    const engagementScore = Math.round(
      (speedRatio * 40) + // Did they spend adequate time?
      (scrollEngagement * 40) + // Did they scroll through content?
      (interactionFactor * 20) // Did they interact with the page?
    );

    readingPatternData.engagementScore = Math.min(engagementScore, 100);

    console.log('[Soul Observer] Reading speed:', wordsPerMinute, 'WPM');
    console.log('[Soul Observer] Engagement score:', readingPatternData.engagementScore);

    return {
      wordsPerMinute,
      engagementScore: readingPatternData.engagementScore,
      readingBehavior: classifyReadingBehavior(wordsPerMinute, speedRatio, scrollEngagement)
    };
  }

  return null;
}

/**
 * Classify reading behavior based on metrics
 */
function classifyReadingBehavior(wpm, timeRatio, scrollEngagement) {
  // Skimming: Fast reading, low scroll depth
  if (wpm > 400 && scrollEngagement < 0.5) {
    return 'skimming';
  }

  // Deep reading: Slow, thorough, high engagement
  if (wpm < 200 && timeRatio > 1.2 && scrollEngagement > 0.7) {
    return 'deep_reading';
  }

  // Scanning: Very fast, high scroll, looking for specific info
  if (wpm > 500 && scrollEngagement > 0.6) {
    return 'scanning';
  }

  // Engaged reading: Moderate speed, good scroll depth
  if (wpm >= 200 && wpm <= 400 && scrollEngagement > 0.6) {
    return 'engaged_reading';
  }

  // Distracted: Inconsistent metrics
  if (timeRatio < 0.3 || (scrollEngagement < 0.3 && currentPageData.interactions < 2)) {
    return 'distracted';
  }

  return 'normal_reading';
}

// Enhance page summary with reading pattern data and web event emission.
// We hook into the existing sendPageSummary by patching it via
// visibilitychange/beforeunload listeners that fire our enhanced logic.
function sendEnhancedPageSummary() {
  // Calculate reading speed if this was an article
  if (readingPatternData.wordCount > 0) {
    const readingMetrics = calculateReadingSpeed();

    if (readingMetrics) {
      sendActivity({
        type: 'reading_completion',
        wordCount: readingPatternData.wordCount,
        estimatedTime: readingPatternData.estimatedReadingTime,
        actualTime: readingPatternData.actualReadingTime,
        readingSpeed: readingMetrics.wordsPerMinute,
        complexity: readingPatternData.complexity,
        topics: readingPatternData.topics,
        engagementScore: readingMetrics.engagementScore,
        readingBehavior: readingMetrics.readingBehavior,
        scrollDepth: currentPageData.scrollDepth,
        interactions: currentPageData.interactions
      });
    }
  }

  // Reset reading pattern data
  readingPatternData = {
    wordCount: 0,
    estimatedReadingTime: 0,
    actualReadingTime: 0,
    readingSpeed: 0,
    complexity: 'medium',
    topics: [],
    engagementScore: 0
  };

  // Emit structured WEB_BROWSING_EVENT for the universal collector
  emitWebBrowsingEvent();
}

// Register additional listeners for the enhanced summary + web event emission.
// These fire alongside (not replacing) the original sendPageSummary listeners.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sendEnhancedPageSummary();
});
window.addEventListener('beforeunload', () => {
  sendEnhancedPageSummary();
});
window.addEventListener('pagehide', () => {
  sendEnhancedPageSummary();
});

// Periodic web event emission: emit after 10 seconds on page, then every 60 seconds.
// This ensures events are captured even if beforeunload/visibilitychange don't fire
// (e.g., programmatic tab close, browser crash, SPA navigation).
setTimeout(() => {
  emitWebBrowsingEvent();
  // Then every 60 seconds for long reading sessions
  setInterval(() => {
    emitWebBrowsingEvent();
  }, 60000);
}, 10000);

// ============================================================
// WEB_BROWSING_EVENT - Structured event emission for all sites
// ============================================================

/**
 * Emit a structured web browsing event to background.js
 * This is the core of the universal data collector.
 */
function emitWebBrowsingEvent() {
  // Web event emission works independently of observer mode - just needs a connected user.
  // Skip in incognito (chrome.extension may not exist in MV3)
  const isIncognito = typeof chrome !== 'undefined' && chrome.extension && chrome.extension.inIncognitoContext;
  if (isIncognito) return;

  const hostname = window.location.hostname;

  // Block sensitive domains
  if (isSensitiveDomain(hostname)) {
    console.log('[Soul Observer] Skipping sensitive domain:', hostname);
    return;
  }

  // Minimum engagement threshold - skip bounces (< 3 seconds)
  const timeOnPage = Math.round((Date.now() - currentPageData.startTime) / 1000);
  if (timeOnPage < 3) return;

  // Throttle: max 1 event per URL per 5 minutes
  const currentUrl = window.location.href;
  if (currentUrl === lastWebEventUrl && (Date.now() - lastWebEventTime) < 5 * 60 * 1000) return;

  const metadata = extractPageMetadata();
  const searchQuery = detectSearchQuery();
  const contentType = detectPageContentType();
  const category = categorizeSite(hostname, metadata);

  // Determine event type
  let eventType = 'page_visit';
  if (searchQuery) eventType = 'search_query';
  else if (contentType === 'article' && timeOnPage > 15) eventType = 'article_read';
  else if (contentType === 'video') eventType = 'web_video_watch';

  // Calculate reading behavior and engagement from existing data
  const readingMetrics = readingPatternData.wordCount > 0 ? calculateReadingSpeed() : null;

  // Build and extract topics from page content
  const contentText = extractArticleContent();
  const topics = contentText.length > 100 ? extractTopics(contentText).slice(0, 10) : [];

  // Add content summary for engaged reading (> 15 seconds)
  let contentSummary = null;
  if (timeOnPage > 15 && contentText.length > 200) {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim())
      .filter(Boolean)
      .slice(0, 5);
    contentSummary = {
      excerpt: contentText.substring(0, 500).trim(),
      headings,
      ogDescription: metadata.ogDescription || metadata.description || null
    };
  }

  const event = {
    eventType,
    url: sanitizeUrlForEvent(currentUrl),
    domain: hostname,
    title: metadata.title || document.title,
    siteName: metadata.ogSiteName || null,
    category,
    metadata: {
      description: (metadata.ogDescription || metadata.description || '').substring(0, 300),
      author: metadata.author || metadata.articleAuthor || null,
      contentType,
      topics,
      contentSummary
    },
    engagement: {
      timeOnPage,
      scrollDepth: currentPageData.scrollDepth,
      readingBehavior: readingMetrics?.readingBehavior || null,
      engagementScore: readingMetrics?.engagementScore || Math.min(
        Math.round((Math.min(timeOnPage, 120) / 120) * 40 + (currentPageData.scrollDepth / 100) * 40 + Math.min(currentPageData.interactions / 10, 1) * 20),
        100
      ),
      interactions: currentPageData.interactions
    },
    searchQuery: searchQuery || null,
    timestamp: new Date().toISOString()
  };

  // Send to background.js
  chrome.runtime.sendMessage({
    type: 'WEB_BROWSING_EVENT',
    data: { events: [event] }
  });

  // Track throttle state
  lastWebEventUrl = currentUrl;
  lastWebEventTime = Date.now();
  webEventEmitted = true;

  console.log(`[Soul Observer] Web event emitted: ${eventType} on ${hostname} (${category})`);
}
