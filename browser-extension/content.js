/**
 * Soul Observer Content Script  
 * Captures behavioral events on every web page
 */

const BATCH_SIZE = 50;
const SESSION_TIMEOUT = 30 * 60 * 1000;

let eventBuffer = [];
let sessionId = null;
let isTracking = false;
let lastActivity = Date.now();

let typingState = { startTime: null, charCount: 0, corrections: 0, lastKeyTime: null };
let mouseState = { lastX: 0, lastY: 0, lastTime: Date.now() };
let scrollState = { lastY: 0, lastTime: Date.now() };
let focusState = { focusStart: null, totalFocusTime: 0 };
let lastSearchQuery = null;

(function init() {
  chrome.storage.local.get(['soulObserverEnabled'], (data) => {
    isTracking = data.soulObserverEnabled !== false;
    console.log(`[Soul Observer] Initialized with tracking ${isTracking ? 'ENABLED' : 'DISABLED'}`);
  });

  sessionId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  console.log('[Soul Observer] Session ID:', sessionId);
  setupEventListeners();
  startBatchSending();
  detectAndCaptureSearch();
})();

// Search detection and capture
function detectAndCaptureSearch() {
  const url = window.location.href;
  const query = extractSearchQuery(url);

  if (query && query !== lastSearchQuery) {
    lastSearchQuery = query;
    const searchEngine = detectSearchEngine(url);
    const category = categorizeSearch(query);

    console.log('[Soul Observer] 🔍 Search detected:', { query, searchEngine, category });

    captureEvent({
      type: 'search_query',
      data: {
        query,
        searchEngine,
        category,
        timestamp: Date.now()
      }
    });
  }
}

function detectSearchEngine(url) {
  if (url.includes('google.com/search')) return 'Google';
  if (url.includes('bing.com/search')) return 'Bing';
  if (url.includes('duckduckgo.com')) return 'DuckDuckGo';
  if (url.includes('yahoo.com/search')) return 'Yahoo';
  if (url.includes('search.brave.com')) return 'Brave';
  if (url.includes('yandex.com/search')) return 'Yandex';
  if (url.includes('baidu.com')) return 'Baidu';
  return 'Unknown';
}

function extractSearchQuery(url) {
  try {
    const urlObj = new URL(url);

    // Google: ?q=query
    if (urlObj.host.includes('google.com')) {
      return urlObj.searchParams.get('q');
    }

    // Bing: ?q=query
    if (urlObj.host.includes('bing.com')) {
      return urlObj.searchParams.get('q');
    }

    // DuckDuckGo: ?q=query
    if (urlObj.host.includes('duckduckgo.com')) {
      return urlObj.searchParams.get('q');
    }

    // Yahoo: ?p=query
    if (urlObj.host.includes('yahoo.com')) {
      return urlObj.searchParams.get('p');
    }

    // Brave: ?q=query
    if (urlObj.host.includes('brave.com')) {
      return urlObj.searchParams.get('q');
    }

    // Yandex: ?text=query
    if (urlObj.host.includes('yandex.com')) {
      return urlObj.searchParams.get('text');
    }

    return null;
  } catch (e) {
    return null;
  }
}

function categorizeSearch(query) {
  if (!query) return 'uncategorized';

  const lowerQuery = query.toLowerCase();

  // Professional/Work keywords
  const professionalKeywords = ['job', 'resume', 'linkedin', 'career', 'salary', 'interview', 'work', 'office', 'meeting', 'project', 'business', 'company', 'software', 'programming', 'code', 'developer', 'engineer', 'data', 'analytics', 'marketing', 'sales'];
  if (professionalKeywords.some(kw => lowerQuery.includes(kw))) return 'professional';

  // Health & Wellness
  const healthKeywords = ['health', 'doctor', 'medicine', 'symptom', 'diet', 'fitness', 'exercise', 'nutrition', 'mental health', 'therapy', 'workout', 'yoga', 'meditation'];
  if (healthKeywords.some(kw => lowerQuery.includes(kw))) return 'health';

  // Finance & Shopping
  const financeKeywords = ['buy', 'price', 'cost', 'cheap', 'discount', 'sale', 'shop', 'purchase', 'invest', 'stock', 'crypto', 'bank', 'loan', 'mortgage', 'credit'];
  if (financeKeywords.some(kw => lowerQuery.includes(kw))) return 'finance_shopping';

  // Entertainment
  const entertainmentKeywords = ['movie', 'film', 'show', 'series', 'watch', 'netflix', 'music', 'song', 'artist', 'concert', 'game', 'play', 'stream'];
  if (entertainmentKeywords.some(kw => lowerQuery.includes(kw))) return 'entertainment';

  // Education & Learning
  const educationKeywords = ['how to', 'tutorial', 'learn', 'course', 'education', 'study', 'university', 'college', 'class', 'lesson', 'guide', 'what is', 'why is'];
  if (educationKeywords.some(kw => lowerQuery.includes(kw))) return 'education';

  // Travel
  const travelKeywords = ['flight', 'hotel', 'travel', 'vacation', 'trip', 'visit', 'destination', 'tourism', 'booking'];
  if (travelKeywords.some(kw => lowerQuery.includes(kw))) return 'travel';

  // Food & Recipes
  const foodKeywords = ['recipe', 'cook', 'restaurant', 'food', 'meal', 'dinner', 'lunch', 'breakfast', 'kitchen'];
  if (foodKeywords.some(kw => lowerQuery.includes(kw))) return 'food';

  // Technology
  const techKeywords = ['tech', 'gadget', 'phone', 'computer', 'laptop', 'tablet', 'app', 'software', 'download', 'update'];
  if (techKeywords.some(kw => lowerQuery.includes(kw))) return 'technology';

  return 'general';
}

function setupEventListeners() {
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  document.addEventListener('mousedown', handleMouseClick, true);
  document.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('focus', () => {
    if (!isTracking) return;
    focusState.focusStart = Date.now();
    captureEvent({ type: 'window_focus', data: { timestamp: Date.now() } });
  });
  window.addEventListener('blur', () => {
    if (!isTracking || !focusState.focusStart) return;
    const duration = Date.now() - focusState.focusStart;
    focusState.totalFocusTime += duration;
    captureEvent({ type: 'window_blur', data: { duration, totalFocusTime: focusState.totalFocusTime } });
    focusState.focusStart = null;
  });
}

function handleKeyDown(e) {
  if (!isTracking) return;
  const now = Date.now();
  if (!typingState.startTime) typingState.startTime = now;
  if (e.key === 'Backspace' || e.key === 'Delete') typingState.corrections++;
  if (e.key.length === 1) typingState.charCount++;
  typingState.lastKeyTime = now;
}

function handleKeyUp(e) {
  if (!isTracking || typingState.charCount === 0) return;
  const now = Date.now();
  const duration = now - typingState.startTime;
  captureEvent({
    type: 'typing',
    data: {
      chars: typingState.charCount,
      duration,
      corrections: typingState.corrections,
      isCorrection: e.key === 'Backspace' || e.key === 'Delete'
    }
  });
}

function handleMouseMove(e) {
  if (!isTracking) return;
  const now = Date.now();
  const timeDelta = now - mouseState.lastTime;
  if (timeDelta > 50) {
    const dx = e.clientX - mouseState.lastX;
    const dy = e.clientY - mouseState.lastY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 5) {
      captureEvent({
        type: 'mouse_move',
        data: { x: e.clientX, y: e.clientY, distance, speed: distance / (timeDelta / 1000) }
      });
      mouseState.lastX = e.clientX;
      mouseState.lastY = e.clientY;
      mouseState.lastTime = now;
    }
  }
}

function handleMouseClick(e) {
  if (!isTracking) return;
  captureEvent({
    type: 'mouse_click',
    data: { x: e.clientX, y: e.clientY, button: e.button, target: e.target.tagName.toLowerCase() }
  });
}

function handleScroll(e) {
  if (!isTracking) return;
  const now = Date.now();
  const timeDelta = now - scrollState.lastTime;
  if (timeDelta > 100) {
    const scrollY = window.scrollY;
    const distance = scrollY - scrollState.lastY;
    if (Math.abs(distance) > 10) {
      captureEvent({
        type: 'scroll',
        data: { y: scrollY, distance, direction: distance > 0 ? 'down' : 'up', speed: Math.abs(distance) / (timeDelta / 1000) }
      });
      scrollState.lastY = scrollY;
      scrollState.lastTime = now;
    }
  }
}

function captureEvent(event) {
  lastActivity = Date.now();
  eventBuffer.push({
    ...event,
    sessionId,
    url: window.location.href,
    pageTitle: document.title,
    timestamp: new Date().toISOString(),
    viewportSize: { width: window.innerWidth, height: window.innerHeight }
  });
  console.log(`[Soul Observer] Event captured: ${event.type}, buffer size: ${eventBuffer.length}/${BATCH_SIZE}`);
  if (eventBuffer.length >= BATCH_SIZE) {
    console.log('[Soul Observer] Buffer full, triggering sendBatch()');
    sendBatch();
  }
}

function sendBatch() {
  if (eventBuffer.length === 0) {
    console.log('[Soul Observer] sendBatch() called but buffer is empty');
    return;
  }

  const batch = [...eventBuffer];
  console.log(`[Soul Observer] 📤 Sending batch of ${batch.length} events to background script`);
  console.log('[Soul Observer] Sample event:', batch[0]);

  eventBuffer = [];

  chrome.runtime.sendMessage({ type: 'SOUL_OBSERVER_EVENT', data: batch }, (response) => {
    console.log('[Soul Observer] Background script response:', response);

    if (chrome.runtime.lastError) {
      console.error('[Soul Observer] ❌ Chrome runtime error:', chrome.runtime.lastError);
      eventBuffer.unshift(...batch);
      return;
    }

    if (!response?.success) {
      console.warn('[Soul Observer] ⚠️ Background script returned failure, re-adding events to buffer');
      eventBuffer.unshift(...batch);
    } else {
      console.log('[Soul Observer] ✅ Batch sent successfully');
    }
  });
}

function startBatchSending() {
  console.log('[Soul Observer] Starting batch sending interval (every 30 seconds)');
  setInterval(() => {
    console.log(`[Soul Observer] ⏰ Interval tick - buffer has ${eventBuffer.length} events`);
    if (eventBuffer.length > 0) {
      console.log('[Soul Observer] Triggering sendBatch() from interval');
      sendBatch();
    }
    if (Date.now() - lastActivity > SESSION_TIMEOUT) {
      console.log('[Soul Observer] Session timeout, creating new session ID');
      sessionId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      lastActivity = Date.now();
    }
  }, 30000);
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.soulObserverEnabled) {
    isTracking = changes.soulObserverEnabled.newValue;
    console.log(`[Soul Observer] Tracking changed to: ${isTracking ? 'ENABLED' : 'DISABLED'}`);
  }
});

// Listen for messages from popup to activate/deactivate Soul Observer
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Soul Observer] Received message:', message.type);

  if (message.type === 'ACTIVATE_SOUL_OBSERVER') {
    isTracking = true;
    console.log('[Soul Observer] ✅ ACTIVATED via message from popup');
    sendResponse({ success: true });
  } else if (message.type === 'DEACTIVATE_SOUL_OBSERVER') {
    isTracking = false;
    console.log('[Soul Observer] ❌ DEACTIVATED via message from popup');
    sendResponse({ success: true });
  }
});

console.log('[Soul Observer] Content script loaded');
