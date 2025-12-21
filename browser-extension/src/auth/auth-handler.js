/**
 * Extension Authentication Handler
 *
 * Handles authentication between browser extension and Twin AI Learn backend.
 * Users authenticate via web app, then extension receives auth token.
 */

const API_URL = 'http://localhost:3001/api';

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auth_token', 'user_id', 'token_expires'], (result) => {
      if (!result.auth_token) {
        resolve(false);
        return;
      }

      // Check if token is expired
      if (result.token_expires && Date.now() > result.token_expires) {
        // Clear expired token
        chrome.storage.local.remove(['auth_token', 'user_id', 'token_expires']);
        resolve(false);
        return;
      }

      resolve(true);
    });
  });
}

/**
 * Get auth token from storage
 */
export async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auth_token'], (result) => {
      resolve(result.auth_token || null);
    });
  });
}

/**
 * Get user ID from storage
 */
export async function getUserId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user_id'], (result) => {
      resolve(result.user_id || null);
    });
  });
}

/**
 * Save authentication data
 */
export async function saveAuthData(authToken, userId, expiresIn = 86400) {
  return new Promise((resolve) => {
    const tokenExpires = Date.now() + (expiresIn * 1000);

    chrome.storage.local.set({
      auth_token: authToken,
      user_id: userId,
      token_expires: tokenExpires
    }, () => {
      console.log('✅ [Auth] Authentication data saved');
      resolve(true);
    });
  });
}

/**
 * Clear authentication data (logout)
 */
export async function clearAuthData() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['auth_token', 'user_id', 'token_expires'], () => {
      console.log('🔓 [Auth] Authentication data cleared');
      resolve(true);
    });
  });
}

/**
 * Initiate authentication flow
 * Opens the Twin AI Learn web app for user to authenticate
 */
export async function initiateAuth() {
  // Open auth page in new tab
  chrome.tabs.create({
    url: `${API_URL.replace('/api', '')}/extension-auth`,
    active: true
  });
}

/**
 * Verify authentication with backend
 */
export async function verifyAuth() {
  const token = await getAuthToken();

  if (!token) {
    return { valid: false, error: 'No token found' };
  }

  try {
    const response = await fetch(`${API_URL}/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      // Token invalid or expired
      await clearAuthData();
      return { valid: false, error: 'Token invalid or expired' };
    }

    const data = await response.json();

    // Update user ID if it changed
    if (data.userId) {
      await chrome.storage.local.set({ user_id: data.userId });
    }

    return { valid: true, userId: data.userId };

  } catch (error) {
    console.error('❌ [Auth] Verification failed:', error);
    return { valid: false, error: error.message };
  }
}

/**
 * Listen for auth messages from web app
 * Web app sends auth token to extension via postMessage
 */
export function setupAuthListener() {
  // Listen for messages from extension auth page
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTENSION_AUTH_SUCCESS') {
      const { authToken, userId, expiresIn } = message.data;

      saveAuthData(authToken, userId, expiresIn)
        .then(() => {
          console.log('✅ [Auth] Authentication successful');
          sendResponse({ success: true });

          // Notify popup to update UI
          chrome.runtime.sendMessage({ type: 'AUTH_STATUS_CHANGED', authenticated: true });
        })
        .catch(error => {
          console.error('❌ [Auth] Failed to save auth data:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true; // Keep message channel open for async response
    }

    if (message.type === 'CHECK_AUTH_STATUS') {
      isAuthenticated()
        .then(authenticated => {
          sendResponse({ authenticated });
        });

      return true;
    }
  });
}

/**
 * Auto-refresh token before expiration
 */
export async function refreshTokenIfNeeded() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auth_token', 'token_expires'], async (result) => {
      if (!result.auth_token || !result.token_expires) {
        resolve(false);
        return;
      }

      // Refresh if token expires in less than 1 hour
      const timeUntilExpiry = result.token_expires - Date.now();
      const oneHour = 60 * 60 * 1000;

      if (timeUntilExpiry < oneHour) {
        console.log('🔄 [Auth] Token expiring soon, refreshing...');

        try {
          const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${result.auth_token}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            await saveAuthData(data.token, data.userId, data.expiresIn);
            console.log('✅ [Auth] Token refreshed successfully');
            resolve(true);
          } else {
            console.error('❌ [Auth] Token refresh failed');
            await clearAuthData();
            resolve(false);
          }
        } catch (error) {
          console.error('❌ [Auth] Token refresh error:', error);
          resolve(false);
        }
      } else {
        resolve(true);
      }
    });
  });
}
