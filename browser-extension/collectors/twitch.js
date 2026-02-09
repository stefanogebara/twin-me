/**
 * Twitch Content Collector
 *
 * Captures watch activity that the Twitch API cannot provide:
 * - Stream watch sessions (channel, game, duration)
 * - Browse/category navigation
 * - Chat engagement metadata (open/closed, NOT message content)
 * - Clip views
 *
 * Twitch is a full SPA - uses history override + MutationObserver.
 */

(() => {
  // Skip incognito
  if (chrome.extension?.inIncognitoContext) return;

  const COLLECTOR_NAME = 'Twitch Collector';
  const FLUSH_INTERVAL_MS = 10000; // 10 seconds
  const MAX_LOCAL_EVENTS = 500;
  const DEDUP_WINDOW_MS = 5000;

  let eventBuffer = [];
  let currentChannel = null;
  let watchStartTime = null;
  let chatOpenTime = null;
  let lastUrl = location.href;
  let recentEventKeys = new Map();

  console.log(`[${COLLECTOR_NAME}] Initialized on ${location.href}`);

  // ============ Utility ============

  function isDuplicate(key) {
    const now = Date.now();
    const last = recentEventKeys.get(key);
    if (last && (now - last) < DEDUP_WINDOW_MS) return true;
    recentEventKeys.set(key, now);
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
    if (eventBuffer.length > MAX_LOCAL_EVENTS) {
      eventBuffer = eventBuffer.slice(-MAX_LOCAL_EVENTS);
    }
  }

  function flushEvents() {
    if (eventBuffer.length === 0) return;

    const events = [...eventBuffer];
    eventBuffer = [];

    chrome.runtime.sendMessage({
      type: 'CAPTURE_TWITCH_DATA',
      data: { events }
    }, () => {
      if (chrome.runtime.lastError) {
        eventBuffer = [...events, ...eventBuffer].slice(-MAX_LOCAL_EVENTS);
      }
    });
  }

  // ============ Channel/Path Parsing ============

  function getChannelFromPath() {
    const path = location.pathname;
    // Skip known non-channel paths
    if (/^\/(directory|settings|subscriptions|inventory|drops|wallet|search|videos|moderator|u\/)/i.test(path)) {
      return null;
    }
    // /channelname or /channelname/clip/xxx or /channelname/videos
    const match = path.match(/^\/([a-zA-Z0-9_]+)/);
    if (match) return match[1];
    return null;
  }

  function isClipPage() {
    return /\/clip\//.test(location.pathname) || location.hostname === 'clips.twitch.tv';
  }

  function isDirectoryPage() {
    return location.pathname.startsWith('/directory');
  }

  // ============ Stream Watch Tracking ============

  function startStreamWatch(channelName) {
    if (currentChannel === channelName && watchStartTime) return;

    finalizeStreamWatch();

    currentChannel = channelName;
    watchStartTime = Date.now();

    // Extract stream info from DOM
    const streamTitle = document.querySelector('[data-a-target="stream-title"]')?.textContent?.trim() || null;
    const gameLink = document.querySelector('[data-a-target="stream-game-link"]');
    const gameName = gameLink?.textContent?.trim() || null;

    bufferEvent({
      eventType: 'stream_watch',
      action: 'start',
      channelName,
      streamTitle,
      gameName
    });

    // Check chat state
    checkChatEngagement();
  }

  function finalizeStreamWatch() {
    if (!currentChannel || !watchStartTime) return;

    const watchDuration = (Date.now() - watchStartTime) / 1000;
    const key = `stream_end_${currentChannel}`;

    if (!isDuplicate(key) && watchDuration > 5) {
      bufferEvent({
        eventType: 'stream_watch',
        action: 'end',
        channelName: currentChannel,
        watchDurationSeconds: Math.round(watchDuration)
      });
    }

    // Finalize chat engagement too
    finalizeChatEngagement();

    currentChannel = null;
    watchStartTime = null;
  }

  // ============ Browse/Category Tracking ============

  function captureDirectoryBrowse() {
    if (!isDirectoryPage()) return;

    const path = location.pathname;
    let category = null;

    // /directory/game/<GameName>
    const gameMatch = path.match(/\/directory\/game\/(.+)/);
    if (gameMatch) {
      category = decodeURIComponent(gameMatch[1]).replace(/-/g, ' ');
    }

    // Capture visible channel cards
    const channelCards = document.querySelectorAll('[data-a-target="preview-card-channel-link"], .tw-link[href*="/"]');
    const channels = [];
    channelCards.forEach((el, i) => {
      if (i >= 10) return;
      const name = el.textContent?.trim();
      if (name && name.length < 50) {
        channels.push(name);
      }
    });

    const key = `browse_${category || 'home'}_${channels.length}`;
    if (isDuplicate(key)) return;

    bufferEvent({
      eventType: 'category_browse',
      category: category || 'directory_home',
      path,
      visibleChannels: channels.slice(0, 10)
    });
  }

  // ============ Chat Engagement (metadata only) ============

  function checkChatEngagement() {
    const chatShell = document.querySelector('.chat-shell, [data-a-target="chat-scroller"]');
    if (chatShell && !chatOpenTime) {
      chatOpenTime = Date.now();
    } else if (!chatShell && chatOpenTime) {
      finalizeChatEngagement();
    }
  }

  function finalizeChatEngagement() {
    if (!chatOpenTime || !currentChannel) return;

    const chatDuration = (Date.now() - chatOpenTime) / 1000;
    if (chatDuration > 10) {
      const key = `chat_${currentChannel}`;
      if (!isDuplicate(key)) {
        bufferEvent({
          eventType: 'chat_engagement',
          channelName: currentChannel,
          isChatOpen: true,
          chatDurationSeconds: Math.round(chatDuration)
        });
      }
    }
    chatOpenTime = null;
  }

  // ============ Clip Views ============

  function captureClipView() {
    if (!isClipPage()) return;

    const path = location.pathname;
    const clipMatch = path.match(/\/clip\/([a-zA-Z0-9_-]+)/);
    const clipId = clipMatch ? clipMatch[1] : null;
    if (!clipId) return;

    const key = `clip_${clipId}`;
    if (isDuplicate(key)) return;

    const channelName = getChannelFromPath();
    const gameEl = document.querySelector('[data-a-target="stream-game-link"]');
    const gameName = gameEl?.textContent?.trim() || null;
    const titleEl = document.querySelector('[data-a-target="stream-title"], h2');
    const clipTitle = titleEl?.textContent?.trim() || null;

    bufferEvent({
      eventType: 'clip_view',
      clipId,
      channelName,
      gameName,
      clipTitle
    });
  }

  // ============ SPA Navigation Detection ============

  function onNavigate() {
    const newUrl = location.href;
    if (newUrl === lastUrl) return;
    lastUrl = newUrl;

    console.log(`[${COLLECTOR_NAME}] Navigation: ${newUrl}`);

    // Check for clip page
    if (isClipPage()) {
      setTimeout(captureClipView, 1500);
      return;
    }

    // Check for directory/browse page
    if (isDirectoryPage()) {
      finalizeStreamWatch();
      setTimeout(captureDirectoryBrowse, 2000);
      return;
    }

    // Check for channel/stream page
    const channel = getChannelFromPath();
    if (channel) {
      setTimeout(() => startStreamWatch(channel), 1500);
      return;
    }

    // Default: finalize any ongoing session
    finalizeStreamWatch();
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

  // MutationObserver for SPA changes
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      onNavigate();
    }
    // Periodically check chat state
    if (currentChannel) {
      checkChatEngagement();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ============ Lifecycle ============

  window.addEventListener('beforeunload', () => {
    finalizeStreamWatch();
    flushEvents();
  });

  setInterval(flushEvents, FLUSH_INTERVAL_MS);

  // Initial page handling
  setTimeout(onNavigate, 1000);
})();
