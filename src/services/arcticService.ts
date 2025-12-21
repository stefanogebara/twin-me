/**
 * Arctic OAuth Service (Frontend)
 * Handles OAuth flows with Arctic-powered backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface ArcticConnectionStatus {
  connected: boolean;
  externalAccountId?: string;
  expiresAt?: string;
  lastSync?: string;
  userInfo?: {
    name?: string;
    email?: string;
    image?: string;
  };
}

export interface ArcticConnectResponse {
  success: boolean;
  authUrl: string;
  provider: string;
}

export interface ArcticCallbackResponse {
  success: boolean;
  provider: string;
  connected: boolean;
  userInfo?: {
    name?: string;
    email?: string;
    image?: string;
  };
}

/**
 * Supported Arctic OAuth providers
 */
export const ARCTIC_PROVIDERS = [
  'spotify',
  'discord',
  'github',
  'reddit',
  'twitch',
  'google_youtube',
  'google_calendar'
] as const;

export type ArcticProvider = typeof ARCTIC_PROVIDERS[number];

/**
 * Initiate OAuth flow for a provider
 * Opens authorization URL in popup window
 */
export async function connectPlatform(
  provider: ArcticProvider,
  userId: string
): Promise<void> {
  try {
    console.log(`[Arctic Service] Initiating ${provider} OAuth for user ${userId}`);

    // Get authorization URL from backend
    const response = await fetch(
      `${API_BASE_URL}/arctic/connect/${provider}?userId=${userId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get authorization URL: ${response.statusText}`);
    }

    const data: ArcticConnectResponse = await response.json();

    if (!data.success || !data.authUrl) {
      throw new Error('Invalid authorization URL response');
    }

    // Parse and log the state parameter from the URL for debugging
    try {
      const url = new URL(data.authUrl);
      const stateParam = url.searchParams.get('state');
      if (stateParam) {
        const decodedState = JSON.parse(atob(stateParam));
        console.log(`[Arctic Service] 🔐 OAuth URL generated for ${provider}`);
        console.log(`[Arctic Service] 📊 State parameter decoded:`, decodedState);
        console.log(`[Arctic Service] 🔗 Full auth URL: ${data.authUrl.substring(0, 150)}...`);
      }
    } catch (e) {
      console.warn(`[Arctic Service] ⚠️  Could not decode state parameter:`, e);
    }

    console.log(`[Arctic Service] 🪟 Opening OAuth popup for ${provider}`);

    // Open OAuth in popup window
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      data.authUrl,
      `${provider}_oauth`,
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      throw new Error('Popup blocked. Please allow popups for this site.');
    }

    // Listen for OAuth callback message
    return new Promise((resolve, reject) => {
      const messageHandler = (event: MessageEvent) => {
        // Verify origin for security
        const allowedOrigins = [
          window.location.origin,
          'http://localhost:8086',
          'http://127.0.0.1:8086'
        ];

        if (!allowedOrigins.includes(event.origin)) {
          return;
        }

        if (event.data.type === 'ARCTIC_OAUTH_SUCCESS') {
          console.log(`[Arctic Service] OAuth success for ${provider}`);
          window.removeEventListener('message', messageHandler);
          popup?.close();
          resolve();
        } else if (event.data.type === 'ARCTIC_OAUTH_ERROR') {
          console.error(`[Arctic Service] OAuth error for ${provider}:`, event.data.error);
          window.removeEventListener('message', messageHandler);
          popup?.close();
          reject(new Error(event.data.error || 'OAuth failed'));
        }
      };

      window.addEventListener('message', messageHandler);

      // Cleanup on popup close
      const pollTimer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', messageHandler);
          reject(new Error('OAuth popup closed'));
        }
      }, 500);
    });
  } catch (error) {
    console.error(`[Arctic Service] Failed to connect ${provider}:`, error);
    throw error;
  }
}

/**
 * Handle OAuth callback (called from popup window)
 */
export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<ArcticCallbackResponse> {
  try {
    console.log('[Arctic Service] Processing OAuth callback');

    const response = await fetch(`${API_BASE_URL}/arctic/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code, state })
    });

    if (!response.ok) {
      throw new Error(`OAuth callback failed: ${response.statusText}`);
    }

    const data: ArcticCallbackResponse = await response.json();

    if (!data.success) {
      throw new Error('OAuth callback unsuccessful');
    }

    console.log(`[Arctic Service] OAuth callback successful for ${data.provider}`);
    return data;
  } catch (error) {
    console.error('[Arctic Service] OAuth callback error:', error);
    throw error;
  }
}

/**
 * Get connection status for all platforms
 */
export async function getConnectionStatus(
  userId: string
): Promise<Record<string, ArcticConnectionStatus>> {
  try {
    const response = await fetch(`${API_BASE_URL}/arctic/status/${userId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch connection status: ${response.statusText}`);
    }

    const data = await response.json();
    return data.connections || {};
  } catch (error) {
    console.error('[Arctic Service] Failed to fetch connection status:', error);
    return {};
  }
}

/**
 * Disconnect a platform
 */
export async function disconnectPlatform(
  userId: string,
  provider: ArcticProvider
): Promise<void> {
  try {
    console.log(`[Arctic Service] Disconnecting ${provider} for user ${userId}`);

    const response = await fetch(
      `${API_BASE_URL}/arctic/disconnect/${userId}/${provider}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error(`Failed to disconnect ${provider}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Failed to disconnect platform');
    }

    console.log(`[Arctic Service] ${provider} disconnected successfully`);
  } catch (error) {
    console.error(`[Arctic Service] Failed to disconnect ${provider}:`, error);
    throw error;
  }
}

/**
 * Manually refresh tokens for a platform
 */
export async function refreshTokens(
  userId: string,
  provider: ArcticProvider
): Promise<void> {
  try {
    console.log(`[Arctic Service] Refreshing tokens for ${provider}`);

    const response = await fetch(
      `${API_BASE_URL}/arctic/refresh/${userId}/${provider}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error(`Failed to refresh tokens: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Failed to refresh tokens');
    }

    console.log(`[Arctic Service] Tokens refreshed for ${provider}`);
  } catch (error) {
    console.error(`[Arctic Service] Failed to refresh tokens for ${provider}:`, error);
    throw error;
  }
}

export default {
  connectPlatform,
  handleOAuthCallback,
  getConnectionStatus,
  disconnectPlatform,
  refreshTokens,
  ARCTIC_PROVIDERS
};
