/**
 * TwinMe Auth Bridge — MAIN world
 *
 * The app keeps its access token IN-MEMORY for XSS hardening — it is never
 * written to localStorage (see apiBase.ts). It exposes the token to the page's
 * MAIN world via window.__twinmeGetAccessToken() and dispatches a
 * 'twinme:tokenchange' event whenever it refreshes.
 *
 * twinme-auth-sync.js runs in the ISOLATED world, where that getter is invisible
 * and the 'twinme:tokenchange' event races against document_idle injection — so
 * the extension was never reliably receiving the token (chrome.storage.auth_token
 * stayed empty and every background sync skipped with "No auth token").
 *
 * This tiny MAIN-world script reads the in-memory token and forwards it to the
 * isolated world via window.postMessage; twinme-auth-sync.js relays it to the
 * background service worker. It reuses the app's existing token — no
 * /api/auth/refresh call, so it never rotates the refresh cookie or races the
 * app's own refresh cycle.
 */
(function () {
  'use strict';

  let lastSent = null;

  function forward(token) {
    if (!token || typeof token !== 'string' || token === lastSent) return;
    if (token.split('.').length !== 3) return; // basic JWT shape guard
    lastSent = token;
    try {
      window.postMessage({ source: 'twinme-auth-bridge', token }, window.location.origin);
    } catch (_) {}
  }

  function readAndForward() {
    try {
      if (typeof window.__twinmeGetAccessToken === 'function') {
        forward(window.__twinmeGetAccessToken());
      }
    } catch (_) {}
  }

  // Path A: forward immediately whenever the app refreshes its in-memory token.
  window.addEventListener('twinme:tokenchange', (e) => {
    try { forward(e && e.detail && e.detail.token); } catch (_) {}
  });

  // Path B: poll the getter to cover the document_idle injection race (the event
  // may have fired before this script loaded) and periodic token refreshes.
  readAndForward();
  setInterval(readAndForward, 15000);
})();
