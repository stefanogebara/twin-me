import { useEffect } from 'react';

/**
 * Hook to automatically sync auth tokens from web app localStorage to browser extension
 * This ensures the extension always has access to the latest auth token
 */
export const useExtensionSync = () => {
  useEffect(() => {
    const syncTokenToExtension = () => {
      // Check if we're running in a browser with Chrome extension API
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return;
      }

      // Get token from localStorage
      const token = localStorage.getItem('auth_token');

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

    // Sync on mount
    syncTokenToExtension();

    // Also sync when localStorage changes (e.g., user logs in/out)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        syncTokenToExtension();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
};
