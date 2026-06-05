/**
 * Netflix MAIN-world interceptor
 * =================================
 * Runs in the page's MAIN world (manifest content_scripts world:"MAIN",
 * run_at:"document_start") so it can see Netflix's OWN fetch/XHR calls.
 *
 * Why this exists: a normal content script runs in an ISOLATED world, so
 * overriding window.fetch there never intercepts the page's requests. That is
 * why the previous collector captured nothing. Here we hook fetch + XHR in the
 * page context, parse the /viewingactivity responses, and postMessage the
 * normalized watch items back to the isolated collector (netflix.js), which
 * forwards them to the backend via the proven SEND_PLATFORM_DATA path.
 */
(function () {
  'use strict';

  /**
   * Pure transform: Netflix viewingactivity `viewedItems` -> normalized watch
   * records. Unit-tested in tests/browser-extension/netflix-collector.test.js.
   */
  function normalizeViewedItems(viewedItems) {
    if (!Array.isArray(viewedItems)) return [];
    return viewedItems
      .map((it) => {
        if (!it || typeof it !== 'object') return null;
        const title = it.seriesTitle || it.title || null;
        if (!title) return null;
        const epoch =
          typeof it.date === 'number'
            ? it.date
            : typeof it.date === 'string' && it.date.trim() !== '' && !Number.isNaN(Number(it.date))
            ? Number(it.date)
            : null;
        const movieID = it.movieID != null ? it.movieID : it.movieId != null ? it.movieId : null;
        return {
          title,
          episodeTitle: it.seriesTitle ? it.title || null : null,
          contentType: it.seriesTitle ? 'series' : 'movie',
          movieID,
          watchedSeconds: typeof it.bookmark === 'number' ? it.bookmark : null,
          watchedAt: epoch ? new Date(epoch * 1000).toISOString() : it.dateStr || null,
        };
      })
      .filter(Boolean);
  }

  // Export for Node unit tests (CommonJS). Browsers don't define `module`.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeViewedItems };
  }

  // ---- Below only runs inside a real page (MAIN world). Skip under Node/tests. ----
  if (typeof window === 'undefined' || window.__twinmeNetflixHooked) return;
  window.__twinmeNetflixHooked = true;

  function emit(viewedItems) {
    const items = normalizeViewedItems(viewedItems);
    if (items.length) {
      // Same-origin postMessage to the isolated content script (shares this window).
      window.postMessage({ __twinmeNetflix: true, items }, window.location.origin);
    }
  }

  function isViewingActivity(url) {
    return typeof url === 'string' && url.indexOf('/viewingactivity') !== -1;
  }

  // ---- fetch hook ----
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      const req = args[0];
      const url = typeof req === 'string' ? req : (req && req.url) || '';
      const p = origFetch.apply(this, args);
      if (isViewingActivity(url)) {
        p.then((res) => {
          try {
            res
              .clone()
              .json()
              .then((j) => {
                if (j && Array.isArray(j.viewedItems)) emit(j.viewedItems);
              })
              .catch(() => {});
          } catch (e) {
            /* opaque/streamed response — ignore */
          }
        }).catch(() => {});
      }
      return p;
    };
  }

  // ---- XHR hook (Netflix issues some calls via XMLHttpRequest) ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__twinmeUrl = url || '';
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (isViewingActivity(this.__twinmeUrl)) {
      this.addEventListener('load', function () {
        let json = null;
        try {
          json = JSON.parse(this.responseText);
        } catch (e) {
          /* not JSON — ignore */
        }
        if (json && Array.isArray(json.viewedItems)) emit(json.viewedItems);
      });
    }
    return origSend.apply(this, args);
  };

  // eslint-disable-next-line no-console
  console.log('[TwinMe] Netflix MAIN-world interceptor installed');
})();
