/**
 * TwinMe Auth Sync Content Script
 *
 * Runs on twinme.me and twin-ai-learn.vercel.app pages and pushes
 * the user's auth data to the extension's background service worker.
 *
 * IMPORTANT: TwinMe's access token now lives IN-MEMORY only (XSS
 * protection — see apiBase.ts). localStorage only holds auth_user
 * metadata (not the bearer token). So we get the token via two paths:
 *
 *   1. CustomEvent 'twinme:tokenchange' that the app dispatches every
 *      time it sets/refreshes the in-memory token.
 *   2. Fallback: poll the app's exposed window.__twinmeGetToken() if
 *      the event was missed (e.g. content script loaded mid-session).
 *
 * Also drops a sentinel `document.documentElement.dataset.twinmeExtension`
 * so the app can detect us (for UX like "Extension detected" badges).
 */

(function () {
  'use strict';

  // Sentinel for the app to detect extension presence
  try { document.documentElement.dataset.twinmeExtension = 'v3.9.2'; } catch (_) {}

  let lastToken = null;
  let lastUserId = null;

  function sendToBackground(userId, token) {
    if (!chrome.runtime || !chrome.runtime.sendMessage) return;
    try {
      chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId }, () => {
        void chrome.runtime.lastError;
      });
      if (token) {
        chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token }, () => {
          void chrome.runtime.lastError;
        });
      }
    } catch (_) {}
  }

  function tryGetUserId() {
    try {
      const userRaw = localStorage.getItem('auth_user');
      if (userRaw) {
        const u = JSON.parse(userRaw);
        if (u && u.id) return u.id;
      }
    } catch (_) {}
    return null;
  }

  function syncFromToken(token) {
    if (!token || typeof token !== 'string' || token.split('.').length !== 3) return;
    let userId = tryGetUserId();
    if (!userId) {
      try {
        const p = JSON.parse(atob(token.split('.')[1]));
        userId = p.id || p.userId || p.sub;
      } catch (_) {}
    }
    if (!userId) return;
    if (token === lastToken && userId === lastUserId) return; // dedup
    lastToken = token;
    lastUserId = userId;
    sendToBackground(userId, token);
  }

  // Path 1: app dispatches CustomEvent when token changes (crosses worlds via DOM)
  window.addEventListener('twinme:tokenchange', (e) => {
    try {
      const detail = e && e.detail ? e.detail : {};
      if (detail.token) syncFromToken(detail.token);
    } catch (_) {}
  });

  // Path 3 (PRIMARY): the MAIN-world bridge (twinme-auth-main.js) reads the app's
  // in-memory token via window.__twinmeGetAccessToken() — which is INVISIBLE from
  // this isolated world (so Path 2 below is dead) — and forwards it here via
  // postMessage. Path 1 above races document_idle injection and can miss the
  // initial dispatch, so this poll-backed bridge is the reliable channel.
  // Validate the message originates from this same window + origin before trusting.
  window.addEventListener('message', (e) => {
    try {
      if (e.source !== window) return;
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (d && d.source === 'twinme-auth-bridge' && d.token) syncFromToken(d.token);
    } catch (_) {}
  });

  // Path 2: poll the app's exposed getter (in case event was missed)
  function pollExposedGetter() {
    try {
      if (typeof window.__twinmeGetAccessToken === 'function') {
        const token = window.__twinmeGetAccessToken();
        if (token) syncFromToken(token);
      }
    } catch (_) {}
  }

  // Initial attempt + periodic re-check
  pollExposedGetter();
  setInterval(pollExposedGetter, 30000);
})();
