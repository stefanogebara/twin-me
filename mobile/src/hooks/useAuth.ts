import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { STORAGE_KEYS, OAUTH_API_URL } from '../constants';
import {
  authFetch,
  claimAuthCode,
  clearStoredSession,
  login as apiLogin,
  refreshSession,
  register as apiRegister,
  verifyToken,
} from '../services/api';
import type { User, AuthState } from '../types';

WebBrowser.maybeCompleteAuthSession();

async function saveSession(token: string, user: User, refreshToken?: string | null) {
  const writes: Promise<void>[] = [
    SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token),
    SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user)),
  ];

  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    writes.push(SecureStore.setItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN, refreshToken));
  } else if (refreshToken === null) {
    writes.push(SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN));
  }

  await Promise.all(writes);
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    isLoading: true,
  });

  // On mount: load cached session immediately, then verify in background
  useEffect(() => {
    (async () => {
      const [token, refreshToken, cachedUserJson] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN),
        SecureStore.getItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN),
        SecureStore.getItemAsync(STORAGE_KEYS.USER),
      ]);

      if (!token && !refreshToken) {
        setState({ token: null, user: null, isLoading: false });
        return;
      }

      // Load cached user immediately — no network wait
      const cachedUser = cachedUserJson ? JSON.parse(cachedUserJson) as User : null;
      if (cachedUser) {
        setState({ token, user: cachedUser, isLoading: false });
      }

      // Verify in background — auto-refresh on expired access tokens, clear session only on auth failure
      verifyToken().then(async user => {
        if (user) {
          const latestToken = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
          setState({ token: latestToken, user, isLoading: false });
          return;
        }

        if (refreshToken) {
          const refreshed = await refreshSession();
          if (refreshed) {
            setState({ token: refreshed.token, user: refreshed.user, isLoading: false });
            return;
          }
        }

        if (!cachedUser) {
          await clearStoredSession();
          setState({ token: null, user: null, isLoading: false });
        }
      }).catch(async (err: Error) => {
        if (err?.message === 'UNAUTHORIZED') {
          // Only clear session if we have no cached user to fall back to.
          // With a cached user, stay logged in — the token will be refreshed
          // on the next API call. This prevents logging out users just because
          // the background verify raced with token expiry.
          if (!cachedUser) {
            await clearStoredSession();
            setState({ token: null, user: null, isLoading: false });
          }
        } else if (!cachedUser) {
          setState({ token: null, user: null, isLoading: false });
        }
      });
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user, refreshToken } = await apiLogin(email, password);
    await saveSession(token, user, refreshToken ?? null);
    setState({ token, user, isLoading: false });
  }, []);

  const signup = useCallback(async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => {
    const { token, user, refreshToken } = await apiRegister(email, password, firstName, lastName);
    await saveSession(token, user, refreshToken ?? null);
    setState({ token, user, isLoading: false });
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const oauthUrl = `${OAUTH_API_URL}/auth/oauth/google?mobile=true`;

    const result = await WebBrowser.openAuthSessionAsync(
      oauthUrl,
      'twinme://auth',
    );

    if (result.type !== 'success' || !result.url) {
      throw new Error('Google sign-in was cancelled.');
    }

    // Extract auth_code from deep link: twinme://auth?auth_code=xxx
    const parsed = Linking.parse(result.url);
    const authCode = parsed.queryParams?.auth_code as string | undefined;

    if (!authCode) {
      throw new Error('No auth code received from Google sign-in.');
    }

    const { token, refreshToken } = await claimAuthCode(authCode);
    await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN, refreshToken);
    }

    // Verify to get user object
    const user = await verifyToken();
    if (!user) throw new Error('Failed to verify session after Google sign-in.');

    await saveSession(token, user, refreshToken ?? null);
    const latestToken = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    setState({ token: latestToken, user, isLoading: false });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort server logout; local session is still cleared below.
    }
    await clearStoredSession();
    setState({ token: null, user: null, isLoading: false });
  }, []);

  return { ...state, login, signup, loginWithGoogle, logout };
}
