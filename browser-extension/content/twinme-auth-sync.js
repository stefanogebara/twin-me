/**
 * TwinMe Auth Sync Content Script
 *
 * Runs on twin-ai-learn.vercel.app pages and automatically pushes
 * the user's auth data to the extension's background service worker.
 *
 * This removes the need for the popup to scrape localStorage via
 * chrome.scripting.executeScript, which is unreliable in some cases
 * (cross-origin, iframes, timing). Content scripts run in the same
 * origin so they have direct access to localStorage.
 */

(function () {
  'use strict';

  function syncAuth() {
    try {
      const token = localStorage.getItem('auth_token');
      const userRaw = localStorage.getItem('auth_user');
      if (!token && !userRaw) return;

      let userId = null;
      let email = null;
      let name = null;

      if (userRaw) {
        try {
          const u = JSON.parse(userRaw);
          userId = u.id;
          email = u.email;
          name = u.name || u.given_name || u.fullName || u.firstName || u.email;
        } catch (_) {}
      }

      // Fallback: decode JWT if user not in localStorage
      if (!userId && token && token.split('.').length === 3) {
        try {
          const p = JSON.parse(atob(token.split('.')[1]));
          userId = p.id || p.userId || p.sub;
          email = p.email || email;
        } catch (_) {}
      }

      if (!userId) return;

      // Send to background service worker
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId }, () => {
          // Ignore callback errors (service worker may be asleep)
          void chrome.runtime.lastError;
        });
        if (token) {
          chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token }, () => {
            void chrome.runtime.lastError;
          });
        }
      }
    } catch (_) {
      // Never throw - content script failures must not break the page
    }
  }

  // Sync on load
  syncAuth();

  // Re-sync periodically in case user signs in/out without reload
  setInterval(syncAuth, 30000);

  // Re-sync on storage changes (sign in, sign out)
  window.addEventListener('storage', (e) => {
    if (e.key === 'auth_token' || e.key === 'auth_user') {
      syncAuth();
    }
  });
})();
