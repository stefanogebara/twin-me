/**
 * LinkedIn Live Collector
 * =======================
 * Captures LinkedIn activity WHILE the user is on linkedin.com, mirroring
 * the Instagram collector pattern. Fills the gap left by LinkedIn's
 * OAuth (OpenID userinfo only — nothing past a sparse profile row).
 *
 * Signals captured:
 *   - feed_dwell:     time spent on /feed/ before navigating away. Useful
 *                     for "how much time on LinkedIn weekly" signals.
 *   - profile_view:   navigation to /in/<username>/ — counts both own and
 *                     others' profiles. Records the slug + visit timestamp.
 *   - search_query:   /search/results/* URL with ?keywords=… extracted.
 *                     LinkedIn-side search topics over time.
 *   - reaction_click: click on a Like/Celebrate/Support/Funny/Love
 *                     reaction button in the feed. The button has
 *                     aria-label="Like"/"React Like" etc. — we read
 *                     ariaLabel only, never the post content.
 *   - connect_click:  click on a "Connect" button on any profile. Used
 *                     to track outbound connection requests.
 *   - share_click:    click on a "Share" or "Post" composer trigger —
 *                     a proxy for outbound posting volume.
 *
 * PRIVACY contract: post bodies, message contents, names of others, and
 * recommendation lists are NEVER read. URLs are sanitised before ship.
 *
 * Ship cadence: events accumulate in a per-page batch and ship every
 * 30s via SEND_PLATFORM_DATA (same channel Instagram uses).
 */

console.log('[Soul Signature] LinkedIn collector loaded');

const LINKEDIN_BATCH = [];
const SHIP_INTERVAL_MS = 30_000;
const FLUSH_DWELL_INTERVAL_MS = 5 * 60_000;

let isAuthenticated = false;
let currentLocation = null;
let currentEnteredAt = null;

// ---------------------------------------------------------------------------
// Auth handshake. Advisory only — capture freely; background.js handles
// the auth gate at ship time. Re-ping on a 10s timer so a slow bridge
// eventually flips the flag (one-shot ping misses if the bridge hasn't
// relayed the token by the time the content script fires).
// ---------------------------------------------------------------------------

function pingAuthStatus() {
  try {
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
      if (chrome.runtime.lastError) return;
      const wasAuthed = isAuthenticated;
      isAuthenticated = Boolean(response?.authenticated);
      if (!wasAuthed && isAuthenticated) {
        console.log('[Soul Signature] LinkedIn collector authenticated');
        onLocationChanged();
      }
    });
  } catch {
    // service worker not awake yet — try again on the next interval
  }
}

pingAuthStatus();
setInterval(pingAuthStatus, 10_000);

// ---------------------------------------------------------------------------
// URL parser.
// kind: 'feed' | 'profile' | 'search' | 'post' | 'jobs' | 'messaging' | 'other'
// ---------------------------------------------------------------------------

function parseLinkedInLocation(href) {
  try {
    const u = new URL(href);
    const path = u.pathname;
    if (path === '/' || path.startsWith('/feed')) return { kind: 'feed', url: href };
    if (path.startsWith('/in/')) {
      const slug = path.split('/').filter(Boolean)[1] || null;
      return { kind: 'profile', slug, url: href };
    }
    if (path.startsWith('/search/results/')) {
      const keywords = u.searchParams.get('keywords') || null;
      return { kind: 'search', query: keywords ? keywords.trim() : null, url: href };
    }
    if (path.startsWith('/posts/')) return { kind: 'post', url: href };
    if (path.startsWith('/jobs/')) return { kind: 'jobs', url: href };
    if (path.startsWith('/messaging/')) return { kind: 'messaging', url: href };
    return { kind: 'other', url: href };
  } catch {
    return { kind: 'other', url: href };
  }
}

// ---------------------------------------------------------------------------
// Dwell tracking — same shape as Discord.
// ---------------------------------------------------------------------------

function pushEvent(event) {
  LINKEDIN_BATCH.push(event);
}

function flushDwell(reason) {
  if (!currentLocation || !currentEnteredAt) return;
  const seconds = Math.round((Date.now() - currentEnteredAt) / 1000);
  if (seconds < 2) return;
  pushEvent({
    eventType: 'page_dwell',
    platform: 'linkedin',
    timestamp: new Date(currentEnteredAt).toISOString(),
    data: {
      kind: currentLocation.kind,
      slug: currentLocation.slug ?? null,
      query: currentLocation.query ?? null,
      duration_seconds: seconds,
      ended_at: new Date().toISOString(),
      reason,
      title: linkedInDwellTitle(currentLocation, seconds),
      url: currentLocation.url,
      type: 'page_dwell',
    },
  });
  currentEnteredAt = null;
}

function linkedInDwellTitle(loc, seconds) {
  const minutes = Math.round((seconds / 60) * 10) / 10;
  switch (loc.kind) {
    case 'feed': return `Spent ${minutes}m scrolling LinkedIn feed`;
    case 'profile': return `Spent ${minutes}m on LinkedIn profile ${loc.slug ?? ''}`.trim();
    case 'search': return `Spent ${minutes}m on LinkedIn search "${loc.query ?? ''}"`.trim();
    case 'post': return `Spent ${minutes}m on a LinkedIn post`;
    case 'jobs': return `Spent ${minutes}m on LinkedIn jobs`;
    case 'messaging': return `Spent ${minutes}m on LinkedIn messages`;
    default: return `Spent ${minutes}m on LinkedIn`;
  }
}

function onLocationChanged() {
  // No capture-time auth gate — see auth handshake comment above.
  const next = parseLinkedInLocation(location.href);
  flushDwell('navigation');

  // Always log a visit event for these high-signal pages.
  if (next.kind === 'profile') {
    pushEvent({
      eventType: 'profile_view',
      platform: 'linkedin',
      timestamp: new Date().toISOString(),
      data: {
        slug: next.slug,
        url: next.url,
        title: `Viewed LinkedIn profile ${next.slug ?? ''}`.trim(),
        type: 'profile_view',
      },
    });
  } else if (next.kind === 'search' && next.query) {
    pushEvent({
      eventType: 'search_query',
      platform: 'linkedin',
      timestamp: new Date().toISOString(),
      data: {
        query: next.query,
        url: next.url,
        title: `LinkedIn search: "${next.query}"`,
        type: 'search_query',
      },
    });
  }

  // Track dwell on any page kind worth measuring.
  if (['feed', 'profile', 'search', 'post', 'jobs', 'messaging'].includes(next.kind)) {
    currentLocation = next;
    currentEnteredAt = Date.now();
  } else {
    currentLocation = null;
  }
}

// ---------------------------------------------------------------------------
// SPA route tracking. LinkedIn uses Ember/Helio — pushState + popstate
// patches cover navigation. Poll URL as fallback.
// ---------------------------------------------------------------------------

const _pushState = history.pushState;
history.pushState = function (...args) {
  const ret = _pushState.apply(this, args);
  queueMicrotask(onLocationChanged);
  return ret;
};
const _replaceState = history.replaceState;
history.replaceState = function (...args) {
  const ret = _replaceState.apply(this, args);
  queueMicrotask(onLocationChanged);
  return ret;
};
window.addEventListener('popstate', onLocationChanged);

let lastSeenUrl = location.href;
setInterval(() => {
  if (location.href !== lastSeenUrl) {
    lastSeenUrl = location.href;
    onLocationChanged();
  }
}, 1000);

// ---------------------------------------------------------------------------
// Reaction + Connect + Share click capture.
// LinkedIn's reaction button on a post has aria-label like:
//   "React Like" / "React Celebrate" / "React Support" / "React Love" / "React Insightful" / "React Funny"
// "Connect" button has aria-label starting with "Invite" or text "Connect".
// "Share" / "Post" composer trigger button labelled accordingly.
// ---------------------------------------------------------------------------

const REACTION_RX = /^react\s+(like|celebrate|support|love|insightful|funny|curious)\b/i;
const CONNECT_RX = /^(connect|invite\b.*to connect)/i;
const SHARE_RX = /^(start a post|create a post|share|repost)$/i;

function classifyButton(label) {
  const l = (label || '').trim();
  if (REACTION_RX.test(l)) return { kind: 'reaction_click', reaction: l.split(/\s+/).slice(1).join(' ').toLowerCase() };
  if (CONNECT_RX.test(l)) return { kind: 'connect_click' };
  if (SHARE_RX.test(l)) return { kind: 'share_click' };
  return null;
}

document.addEventListener(
  'click',
  (e) => {
    if (!(e.target instanceof Element)) return;
    const btn = e.target.closest('button, [role="button"], a');
    if (!btn) return;
    const label = btn.getAttribute('aria-label') || btn.textContent?.trim() || '';
    if (!label) return;
    const cls = classifyButton(label);
    if (!cls) return;
    pushEvent({
      eventType: cls.kind,
      platform: 'linkedin',
      timestamp: new Date().toISOString(),
      data: {
        reaction: cls.reaction || null,
        url: location.href,
        title:
          cls.kind === 'reaction_click'
            ? `Reacted ${cls.reaction ?? ''} on LinkedIn`.trim()
            : cls.kind === 'connect_click'
              ? 'Clicked LinkedIn Connect'
              : 'Started a LinkedIn post',
        type: cls.kind,
      },
    });
  },
  { capture: true, passive: true }
);

// ---------------------------------------------------------------------------
// Visibility + unload — flush dwell.
// ---------------------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flushDwell('visibility_hidden');
  } else if (currentLocation && !currentEnteredAt) {
    currentEnteredAt = Date.now();
  }
});

window.addEventListener('beforeunload', () => flushDwell('unload'));

setInterval(() => {
  flushDwell('interval_flush');
  if (currentLocation && !currentEnteredAt) currentEnteredAt = Date.now();
}, FLUSH_DWELL_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Ship batch every 30s.
// ---------------------------------------------------------------------------

setInterval(() => {
  if (LINKEDIN_BATCH.length === 0) return;
  const events = LINKEDIN_BATCH.splice(0, LINKEDIN_BATCH.length);
  try {
    chrome.runtime.sendMessage(
      { type: 'SEND_PLATFORM_DATA', platform: 'linkedin', events },
      () => {
        void chrome.runtime.lastError;
      }
    );
    console.log(`[Soul Signature] shipped ${events.length} LinkedIn events`);
  } catch (e) {
    console.warn('[Soul Signature] LinkedIn ship error:', e);
  }
}, SHIP_INTERVAL_MS);

console.log('[Soul Signature] LinkedIn collector installed');
