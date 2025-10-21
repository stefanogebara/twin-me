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

// Initialize reading analysis when observer starts
const originalInitializeObserver = initializeObserver;
function initializeObserver() {
  originalInitializeObserver();

  // Run reading analysis on page load if it's an article
  setTimeout(() => {
    if (isArticleContent()) {
      analyzeReadingPatterns();
    }
  }, 2000); // Wait 2 seconds for page to fully load
}

// Enhance page summary with reading pattern data
const originalSendPageSummary = sendPageSummary;
function sendPageSummary() {
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

  // Call original function
  originalSendPageSummary();

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
}
