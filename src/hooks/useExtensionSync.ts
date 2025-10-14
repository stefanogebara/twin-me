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
        console.log('[Extension Sync] No auth token found in localStorage');
        return;
      }

      // Try to send token to extension
      try {
        chrome.runtime.sendMessage(
          'acnofcjjfjaikcfnalggkkbghjaijepc', // Extension ID
          { type: 'SET_AUTH_TOKEN', token },
          (response) => {
            if (chrome.runtime.lastError) {
              // Extension not installed or not responding - this is normal
              console.log('[Extension Sync] Extension not available:', chrome.runtime.lastError.message);
            } else {
              console.log('[Extension Sync] ✅ Token synced to extension successfully');
            }
          }
        );
      } catch (error) {
        console.log('[Extension Sync] Could not sync to extension:', error);
      }
    };

    // Sync on mount
    syncTokenToExtension();

    // Also sync when localStorage changes (e.g., user logs in/out)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        console.log('[Extension Sync] Auth token changed, syncing to extension...');
        syncTokenToExtension();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
};
