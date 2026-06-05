/**
 * Netflix Data Collector (isolated content script)
 * =================================================
 * The REAL capture happens in netflix-inject.js (MAIN world), which hooks
 * Netflix's own fetch/XHR for /viewingactivity and postMessages normalized
 * watch items here. This script forwards them to the backend via
 * SEND_PLATFORM_DATA -> sendToBackend -> /api/extension as PER-ITEM events
 * (the proven path YouTube/Twitch use, so each watch becomes an
 * `extension_video_watch` observation in the memory stream).
 *
 * History: the previous version overrode window.fetch *here* — a no-op, because
 * content scripts run in the ISOLATED world and never see the page's fetches.
 * It also scraped removed-years-ago `.userRating` star ratings. Both deleted.
 */

console.log('[TwinMe] Netflix collector loaded');

const seenKeys = new Set();
let pending = [];
let flushTimer = null;

function keyFor(it) {
  return [it.title || '', it.episodeTitle || '', it.watchedAt || '', it.movieID || ''].join('|');
}

function enqueue(items) {
  let added = 0;
  for (const it of items || []) {
    if (!it || !it.title) continue;
    const k = keyFor(it);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    pending.push(it);
    added++;
  }
  if (added) scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 1500);
}

function flush() {
  flushTimer = null;
  if (!pending.length) return;
  const batch = pending.splice(0, pending.length);
  const events = batch.map((it) => ({
    eventType: 'video_watch',
    platform: 'netflix',
    timestamp: it.watchedAt || new Date().toISOString(),
    data: {
      title: it.title,
      type: it.contentType || 'content', // backend (extension-data.js B2) reads inner.type
      episode: it.episodeTitle || undefined,
      url: it.movieID ? `https://www.netflix.com/watch/${it.movieID}` : '',
      watchedSeconds: it.watchedSeconds || undefined,
    },
  }));
  try {
    chrome.runtime.sendMessage({ type: 'SEND_PLATFORM_DATA', platform: 'netflix', events }, (resp) => {
      if (chrome.runtime.lastError) return; // service worker asleep; next batch retries
      if (resp && resp.success) console.log(`[TwinMe] Sent ${events.length} Netflix watch events`);
      else console.warn('[TwinMe] Netflix send rejected:', resp && resp.error);
    });
  } catch (e) {
    console.warn('[TwinMe] Netflix send failed:', e && e.message);
  }
}

// PRIMARY: watch items captured by the MAIN-world interceptor (netflix-inject.js).
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const d = event.data;
  if (!d || d.__twinmeNetflix !== true || !Array.isArray(d.items)) return;
  enqueue(d.items);
});

// FALLBACK: best-effort scrape of the Account > Viewing Activity page DOM.
// Modern Netflix obfuscates these classes, so this may capture nothing — the
// MAIN-world fetch hook is the reliable path. Defensive; never throws.
function scrapeViewingActivityDom() {
  if (!location.href.includes('/viewingactivity')) return;
  try {
    const rows = document.querySelectorAll('.retableRow, [data-uia="viewing-activity-row"]');
    const items = [];
    rows.forEach((row) => {
      const titleEl = row.querySelector('.title a, .col.title a, [data-uia="title"]');
      const dateEl = row.querySelector('.date, .col.date, [data-uia="date"]');
      const title = titleEl && titleEl.textContent.trim();
      if (title) {
        items.push({
          title,
          episodeTitle: null,
          contentType: 'content',
          movieID: null,
          watchedSeconds: null,
          watchedAt: dateEl ? dateEl.textContent.trim() : null,
        });
      }
    });
    if (items.length) enqueue(items);
  } catch (e) {
    /* defensive — never break the host page */
  }
}

// Auth gate + triggers.
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
  if (chrome.runtime.lastError) return;
  if (response && response.authenticated) {
    console.log('[TwinMe] Authenticated — Netflix capture active');
    scrapeViewingActivityDom();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COLLECT_DATA') {
    scrapeViewingActivityDom();
    flush();
    sendResponse({ success: true });
  }
});
