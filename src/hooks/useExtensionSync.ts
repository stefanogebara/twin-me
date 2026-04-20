import { useEffect } from 'react';
import { getAccessToken } from '@/services/api/apiBase';

/**
 * Hook to automatically sync the in-memory auth token to the browser extension.
 * Token is sourced exclusively from getAccessToken() (never localStorage).
 */
export const useExtensionSync = () => {
  useEffect(() => {
    const syncTokenToExtension = () => {
      // Check if we're running in a browser with Chrome extension API
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return;
      }

      const token = getAccessToken();

      if (!token) {
        return;
      }

      // Try to send token to extension
      try {
        chrome.runtime.sendMessage(
          'acnofcjjfjaikcfnalggkkbghjaijepc', // Extension ID
          { type: 'SET_AUTH_TOKEN', token },
          () => {
          }
        );
      } catch {
        // Extension not installed or messaging failed — intentionally ignored
      }
    };

    // Sync on mount (after AuthContext has rehydrated the token via refresh cookie)
    syncTokenToExtension();
  }, []);
};
