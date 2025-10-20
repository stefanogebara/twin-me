/**
 * Soul Observer Mode - Comprehensive Browser Activity Tracker
 *
 * This powerful mode captures and analyzes EVERYTHING the user does in their browser:
 * - Page visits and navigation patterns
 * - Reading speed and comprehension patterns
 * - Writing style, speed, and editing behavior
 * - Search queries and information seeking patterns
 * - Shopping behavior and decision-making
 * - Work patterns and focus time
 * - Multitasking and context switching
 * - Emotional responses (scroll speed, mouse movement, pause patterns)
 *
 * Privacy: Only activates when user explicitly enables "Soul Observer Mode"
 */

class SoulObserver {
  constructor() {
    this.isActive = false;
    this.sessionData = {
      startTime: null,
      activities: [],
      patterns: {},
      insights: []
    };

    this.observers = {
      page: null,
      keyboard: null,
      mouse: null,
      scroll: null,
      focus: null
    };

    this.aiProcessor = new ActivityAIProcessor();
  }

  /**
   * Activate Soul Observer Mode
   */
  async activate() {
    const settings = await chrome.storage.sync.get(['soulObserverEnabled', 'observerSettings']);

    if (!settings.soulObserverEnabled) {
      console.log('[Soul Observer] Not enabled by user');
      return;
    }

    console.log('[Soul Observer] 🧠 ACTIVATING - Comprehensive tracking mode');
    this.isActive = true;
    this.sessionData.startTime = new Date().toISOString();

    // Initialize all observers
    this.initPageObserver();
    this.initKeyboardObserver();
    this.initMouseObserver();
    this.initScrollObserver();
    this.initFocusObserver();
    this.initDOMObserver();
    this.initFormObserver();
    this.initMediaObserver();

    // Start AI processing loop
    this.startAIProcessing();
  }

  /**
   * Deactivate Soul Observer Mode
   */
  deactivate() {
    console.log('[Soul Observer] Deactivating');
    this.isActive = false;

    // Disconnect all observers
    Object.values(this.observers).forEach(observer => {
      if (observer && observer.disconnect) observer.disconnect();
    });

    // Send final session data
    this.sendSessionData();
  }

  /**
   * Page Navigation Observer
   * Tracks: URLs visited, time spent, navigation patterns
   */
  initPageObserver() {
    // Track page load
    const pageData = {
      type: 'PAGE_VIEW',
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      referrer: document.referrer
    };

    this.sessionData.activities.push(pageData);

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.sessionData.activities.push({
        type: 'PAGE_VISIBILITY',
        visible: !document.hidden,
        timestamp: new Date().toISOString()
      });
    });

    // Track navigation
    window.addEventListener('beforeunload', () => {
      this.sessionData.activities.push({
        type: 'PAGE_LEAVE',
        url: window.location.href,
        timeSpent: Date.now() - new Date(this.sessionData.startTime).getTime(),
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Keyboard Activity Observer
   * Tracks: Typing speed, patterns, corrections, writing style
   */
  initKeyboardObserver() {
    let typingSession = {
      startTime: null,
      keystrokes: [],
      field: null
    };

    document.addEventListener('keydown', (e) => {
      if (!this.isActive) return;

      // Start typing session
      if (!typingSession.startTime) {
        typingSession.startTime = Date.now();
        typingSession.field = e.target.tagName + (e.target.id ? `#${e.target.id}` : '');
      }

      typingSession.keystrokes.push({
        key: e.key.length === 1 ? e.key : `[${e.key}]`, // Hide special keys
        timestamp: Date.now(),
        isBackspace: e.key === 'Backspace',
        isDelete: e.key === 'Delete'
      });

      // Analyze typing pattern every 10 keystrokes
      if (typingSession.keystrokes.length % 10 === 0) {
        const typingSpeed = this.calculateTypingSpeed(typingSession.keystrokes);
        const corrections = typingSession.keystrokes.filter(k => k.isBackspace || k.isDelete).length;

        this.sessionData.activities.push({
          type: 'TYPING_PATTERN',
          speed: typingSpeed, // WPM
          corrections,
          field: typingSession.field,
          timestamp: new Date().toISOString()
        });
      }
    });

    // End typing session after 3 seconds of inactivity
    let typingTimeout;
    document.addEventListener('keydown', () => {
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        if (typingSession.keystrokes.length > 0) {
          this.analyzeTypingSession(typingSession);
          typingSession = { startTime: null, keystrokes: [], field: null };
        }
      }, 3000);
    });
  }

  /**
   * Mouse Movement & Click Observer
   * Tracks: Decision-making patterns, hesitation, precision, exploration
   */
  initMouseObserver() {
    let mouseData = {
      movements: [],
      clicks: [],
      hovers: []
    };

    // Track mouse movement (throttled)
    let lastMove = 0;
    document.addEventListener('mousemove', (e) => {
      if (!this.isActive) return;

      const now = Date.now();
      if (now - lastMove < 100) return; // Throttle to every 100ms
      lastMove = now;

      mouseData.movements.push({
        x: e.clientX,
        y: e.clientY,
        timestamp: now
      });

      // Analyze every 50 movements
      if (mouseData.movements.length >= 50) {
        const speed = this.calculateMouseSpeed(mouseData.movements);
        const pattern = this.analyzeMousePattern(mouseData.movements);

        this.sessionData.activities.push({
          type: 'MOUSE_BEHAVIOR',
          speed,
          pattern, // erratic, smooth, purposeful, exploratory
          timestamp: new Date().toISOString()
        });

        mouseData.movements = [];
      }
    });

    // Track clicks
    document.addEventListener('click', (e) => {
      if (!this.isActive) return;

      const targetElement = e.target;
      mouseData.clicks.push({
        element: targetElement.tagName,
        text: targetElement.textContent?.slice(0, 50),
        href: targetElement.href || targetElement.closest('a')?.href,
        timestamp: Date.now()
      });

      this.sessionData.activities.push({
        type: 'CLICK',
        element: targetElement.tagName,
        context: targetElement.textContent?.slice(0, 50),
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Scroll Behavior Observer
   * Tracks: Reading speed, attention patterns, skimming vs deep reading
   */
  initScrollObserver() {
    let scrollData = {
      positions: [],
      speed: 0,
      direction: null
    };

    let lastScroll = 0;
    window.addEventListener('scroll', () => {
      if (!this.isActive) return;

      const now = Date.now();
      const position = window.scrollY;
      const direction = position > scrollData.positions[scrollData.positions.length - 1]?.position ? 'down' : 'up';

      scrollData.positions.push({
        position,
        timestamp: now,
        direction
      });

      // Analyze scroll behavior
      if (now - lastScroll > 1000) { // Every second
        const scrollSpeed = this.calculateScrollSpeed(scrollData.positions);
        const pattern = this.analyzeScrollPattern(scrollData.positions);

        this.sessionData.activities.push({
          type: 'SCROLL_BEHAVIOR',
          speed: scrollSpeed,
          pattern, // skimming, reading, searching, reviewing
          timestamp: new Date().toISOString()
        });

        lastScroll = now;
      }
    });
  }

  /**
   * Focus & Attention Observer
   * Tracks: Multitasking, focus duration, context switching
   */
  initFocusObserver() {
    let focusData = {
      currentFocus: null,
      focusStart: null,
      focusSessions: []
    };

    // Track focus on input fields
    document.addEventListener('focus', (e) => {
      if (!this.isActive) return;

      if (focusData.currentFocus) {
        // End previous focus session
        focusData.focusSessions.push({
          element: focusData.currentFocus,
          duration: Date.now() - focusData.focusStart,
          timestamp: new Date().toISOString()
        });
      }

      focusData.currentFocus = e.target.tagName + (e.target.id ? `#${e.target.id}` : '');
      focusData.focusStart = Date.now();
    }, true);

    document.addEventListener('blur', (e) => {
      if (!this.isActive || !focusData.currentFocus) return;

      this.sessionData.activities.push({
        type: 'FOCUS_SESSION',
        element: focusData.currentFocus,
        duration: Date.now() - focusData.focusStart,
        timestamp: new Date().toISOString()
      });

      focusData.currentFocus = null;
    }, true);
  }

  /**
   * DOM Content Observer
   * Tracks: What content user is exposed to, reading patterns
   */
  initDOMObserver() {
    const config = { childList: true, subtree: true };

    this.observers.page = new MutationObserver((mutations) => {
      if (!this.isActive) return;

      // Track significant DOM changes (dynamic content loading)
      const significantChanges = mutations.filter(m =>
        m.addedNodes.length > 0 || m.removedNodes.length > 0
      );

      if (significantChanges.length > 5) {
        this.sessionData.activities.push({
          type: 'CONTENT_CHANGE',
          changes: significantChanges.length,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.observers.page.observe(document.body, config);
  }

  /**
   * Form Interaction Observer
   * Tracks: Shopping behavior, form filling patterns, decision-making
   */
  initFormObserver() {
    document.addEventListener('change', (e) => {
      if (!this.isActive) return;

      if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'radio') {
        this.sessionData.activities.push({
          type: 'FORM_INTERACTION',
          field: e.target.name || e.target.id,
          value: e.target.value,
          timestamp: new Date().toISOString()
        });
      }
    });

    document.addEventListener('submit', (e) => {
      if (!this.isActive) return;

      this.sessionData.activities.push({
        type: 'FORM_SUBMIT',
        action: e.target.action,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Media Consumption Observer
   * Tracks: Video watching, pause patterns, engagement
   */
  initMediaObserver() {
    const videos = document.querySelectorAll('video');

    videos.forEach(video => {
      video.addEventListener('play', () => {
        this.sessionData.activities.push({
          type: 'VIDEO_PLAY',
          src: video.src || video.currentSrc,
          timestamp: new Date().toISOString()
        });
      });

      video.addEventListener('pause', () => {
        this.sessionData.activities.push({
          type: 'VIDEO_PAUSE',
          currentTime: video.currentTime,
          timestamp: new Date().toISOString()
        });
      });
    });
  }

  /**
   * AI Processing - Analyze activities and extract insights
   */
  startAIProcessing() {
    // Process activities every 30 seconds
    setInterval(async () => {
      if (!this.isActive || this.sessionData.activities.length < 10) return;

      const insights = await this.aiProcessor.analyzeActivities(this.sessionData.activities);

      this.sessionData.insights.push(...insights);

      // Send to backend for LLM processing
      chrome.runtime.sendMessage({
        type: 'SOUL_OBSERVER_DATA',
        data: {
          activities: this.sessionData.activities.splice(0, 100), // Send batch of 100
          insights
        }
      });

    }, 30000);
  }

  /**
   * Helper: Calculate typing speed (WPM)
   */
  calculateTypingSpeed(keystrokes) {
    const duration = (keystrokes[keystrokes.length - 1].timestamp - keystrokes[0].timestamp) / 1000 / 60;
    const words = keystrokes.filter(k => k.key === ' ').length;
    return Math.round(words / duration);
  }

  /**
   * Helper: Calculate mouse movement speed
   */
  calculateMouseSpeed(movements) {
    let totalDistance = 0;
    for (let i = 1; i < movements.length; i++) {
      const dx = movements[i].x - movements[i-1].x;
      const dy = movements[i].y - movements[i-1].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    const duration = (movements[movements.length - 1].timestamp - movements[0].timestamp) / 1000;
    return Math.round(totalDistance / duration); // pixels per second
  }

  /**
   * Helper: Analyze mouse movement pattern
   */
  analyzeMousePattern(movements) {
    // Calculate variance in speed to detect pattern
    const speeds = [];
    for (let i = 1; i < movements.length; i++) {
      const dt = movements[i].timestamp - movements[i-1].timestamp;
      const dx = movements[i].x - movements[i-1].x;
      const dy = movements[i].y - movements[i-1].y;
      speeds.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }

    const variance = this.calculateVariance(speeds);

    if (variance > 100) return 'erratic'; // Uncertain, exploring
    if (variance < 20) return 'smooth'; // Confident, purposeful
    return 'normal';
  }

  /**
   * Helper: Calculate scroll speed
   */
  calculateScrollSpeed(positions) {
    if (positions.length < 2) return 0;
    const distance = Math.abs(positions[positions.length - 1].position - positions[0].position);
    const duration = (positions[positions.length - 1].timestamp - positions[0].timestamp) / 1000;
    return Math.round(distance / duration); // pixels per second
  }

  /**
   * Helper: Analyze scroll pattern
   */
  analyzeScrollPattern(positions) {
    if (positions.length < 5) return 'unknown';

    const speed = this.calculateScrollSpeed(positions);
    const backScrolls = positions.filter(p => p.direction === 'up').length;
    const backScrollRatio = backScrolls / positions.length;

    if (speed > 500) return 'skimming'; // Fast scrolling
    if (backScrollRatio > 0.3) return 'reviewing'; // Scrolling back frequently
    if (speed < 100) return 'reading'; // Slow, deliberate scrolling
    return 'searching'; // Medium speed, directional
  }

  /**
   * Helper: Analyze typing session
   */
  analyzeTypingSession(session) {
    const corrections = session.keystrokes.filter(k => k.isBackspace || k.isDelete).length;
    const correctionRate = corrections / session.keystrokes.length;
    const speed = this.calculateTypingSpeed(session.keystrokes);

    this.sessionData.activities.push({
      type: 'TYPING_SESSION_COMPLETE',
      field: session.field,
      keystrokeCount: session.keystrokes.length,
      speed,
      correctionRate,
      duration: Date.now() - session.startTime,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Helper: Calculate variance
   */
  calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Send session data to backend
   */
  async sendSessionData() {
    chrome.runtime.sendMessage({
      type: 'SOUL_OBSERVER_SESSION_END',
      data: this.sessionData
    });

    // Reset session
    this.sessionData = {
      startTime: null,
      activities: [],
      patterns: {},
      insights: []
    };
  }
}

/**
 * AI Activity Processor
 * Analyzes raw activity data and extracts psychological insights
 */
class ActivityAIProcessor {
  async analyzeActivities(activities) {
    const insights = [];

    // Analyze typing patterns
    const typingActivities = activities.filter(a => a.type.includes('TYPING'));
    if (typingActivities.length > 0) {
      insights.push({
        category: 'writing_style',
        insight: this.analyzeWritingStyle(typingActivities),
        confidence: 0.8
      });
    }

    // Analyze browsing patterns
    const browsingActivities = activities.filter(a => a.type === 'PAGE_VIEW');
    if (browsingActivities.length > 0) {
      insights.push({
        category: 'information_seeking',
        insight: this.analyzeBrowsingBehavior(browsingActivities),
        confidence: 0.75
      });
    }

    // Analyze decision-making
    const clickActivities = activities.filter(a => a.type === 'CLICK');
    if (clickActivities.length > 0) {
      insights.push({
        category: 'decision_making',
        insight: this.analyzeDecisionMaking(clickActivities),
        confidence: 0.7
      });
    }

    return insights;
  }

  analyzeWritingStyle(typingActivities) {
    const avgSpeed = typingActivities.reduce((sum, a) => sum + (a.speed || 0), 0) / typingActivities.length;
    const avgCorrections = typingActivities.reduce((sum, a) => sum + (a.correctionRate || 0), 0) / typingActivities.length;

    if (avgSpeed > 60 && avgCorrections < 0.1) {
      return 'Confident writer: Fast typing with minimal corrections suggests strong command of language and decisive communication';
    } else if (avgSpeed < 40 && avgCorrections > 0.2) {
      return 'Thoughtful writer: Slower pace with revisions indicates careful consideration and precision in communication';
    } else {
      return 'Balanced writer: Moderate speed and corrections suggest adaptive communication style';
    }
  }

  analyzeBrowsingBehavior(browsingActivities) {
    const urls = browsingActivities.map(a => a.url);
    const uniqueDomains = new Set(urls.map(url => new URL(url).hostname)).size;

    if (uniqueDomains > 10) {
      return 'Exploratory mindset: Frequent domain switching suggests curiosity and broad information gathering';
    } else if (uniqueDomains < 3) {
      return 'Focused mindset: Concentrated browsing suggests deep engagement with specific topics';
    } else {
      return 'Balanced information seeking: Moderate domain diversity suggests purposeful exploration';
    }
  }

  analyzeDecisionMaking(clickActivities) {
    const clicksPerMinute = clickActivities.length / 1; // Simplified

    if (clicksPerMinute > 10) {
      return 'Rapid decision maker: High click rate suggests quick evaluation and decisive action';
    } else if (clicksPerMinute < 3) {
      return 'Deliberate decision maker: Lower click rate suggests careful evaluation before action';
    } else {
      return 'Balanced decision making: Moderate pace suggests thoughtful but efficient choices';
    }
  }
}

// Initialize Soul Observer
const soulObserver = new SoulObserver();

// Listen for activation message
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ACTIVATE_SOUL_OBSERVER') {
    soulObserver.activate();
    sendResponse({ success: true });
  }

  if (message.type === 'DEACTIVATE_SOUL_OBSERVER') {
    soulObserver.deactivate();
    sendResponse({ success: true });
  }
});

// Check if should auto-activate
chrome.storage.sync.get(['soulObserverEnabled', 'soulObserverAutoStart'], (result) => {
  if (result.soulObserverEnabled && result.soulObserverAutoStart) {
    soulObserver.activate();
  }
});

console.log('[Soul Observer] Loaded and ready');
