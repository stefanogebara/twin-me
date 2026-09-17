import { detachCaptureSession } from '../services/captureSession';
import { currentSessionEpoch, invalidateSession, writeSession } from '../services/sessionEpoch';
import { useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { STORAGE_KEYS, API_URL, OAUTH_API_URL } from '../constants';
import {
  SESSION_EXPIRED,
  claimAuthCode,
  clearStoredSession,
  login as apiLogin,
  refreshSession,
  register as apiRegister,
  verifyToken,
} from '../services/api';
import type { User, AuthState } from '../types';

WebBrowser.maybeCompleteAuthSession();

async function saveSession(epoch: number, token: string, user: User, refreshToken?: string | null) {
  return writeSession(epoch, async () => {
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
  });
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    isLoading: true,
  });

  // A refused refresh anywhere in the app ends the session here, so the shell shows the door.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SESSION_EXPIRED, () => {
      setState({ token: null, user: null, isLoading: false });
    });
    return () => sub.remove();
  }, []);

  // On mount: load cached session immediately, then verify in background
  useEffect(() => {
    let active = true;
    const epoch = currentSessionEpoch();
    const current = () => active && epoch === currentSessionEpoch();
    (async () => {
      /* A keychain that cannot be read (a rebuilt binary with different entitlements, a
         locked device) must not leave the app on blank paper forever: it means signed out. */
      let stored: [string | null, string | null, string | null];
      try {
        stored = await Promise.all([
          SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN),
          SecureStore.getItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN),
          SecureStore.getItemAsync(STORAGE_KEYS.USER),
        ]);
      } catch (err) {
        if (!current()) return;
        if (__DEV__) console.warn('[Auth] stored session unreadable', String(err));
        setState({ token: null, user: null, isLoading: false });
        return;
      }
      if (!current()) return;
      const [token, refreshToken, cachedUserJson] = stored;

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
        if (!current()) return;
        if (user) {
          const latestToken = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
          if (current()) setState({ token: latestToken, user, isLoading: false });
          return;
        }

        if (refreshToken) {
          const refreshed = await refreshSession();
          if (!current()) return;
          if (refreshed) {
            setState({ token: refreshed.token, user: refreshed.user, isLoading: false });
            return;
          }
        }

        if (!cachedUser) {
          setState({ token: null, user: null, isLoading: false });
          await clearStoredSession();
        }
      }).catch(async (err: Error) => {
        if (!current()) return;
        if (err?.message === 'UNAUTHORIZED') {
          // Only clear session if we have no cached user to fall back to.
          // With a cached user, stay logged in — the token will be refreshed
          // on the next API call. This prevents logging out users just because
          // the background verify raced with token expiry.
          if (!cachedUser) {
            setState({ token: null, user: null, isLoading: false });
            await clearStoredSession();
          }
        } else if (!cachedUser) {
          setState({ token: null, user: null, isLoading: false });
        }
      });
    })();
    return () => { active = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const epoch = invalidateSession();
    detachCaptureSession();
    const { token, user, refreshToken } = await apiLogin(email, password);
    if (!await saveSession(epoch, token, user, refreshToken ?? null)) return;
    setState({ token, user, isLoading: false });
  }, []);

  const signup = useCallback(async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => {
    const epoch = invalidateSession();
    detachCaptureSession();
    const { token, user, refreshToken } = await apiRegister(email, password, firstName, lastName);
    if (!await saveSession(epoch, token, user, refreshToken ?? null)) return;
    setState({ token, user, isLoading: false });
  }, []);

  /**
   * A one-time auth code becomes a session. Google sign-in produces one, and so does the
   * sign-in link the website emails: the server redirects it to twinme://auth?auth_code=...
   * when the tap happens on a phone. Both end here, so there is one way to finish signing
   * in rather than two that drift apart.
   */
  const finishWithAuthCode = useCallback(async (authCode: string) => {
    const epoch = invalidateSession();
    detachCaptureSession();
    const { token, refreshToken } = await claimAuthCode(authCode);
    if (!await writeSession(epoch, async () => {
    await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN, refreshToken);
    }
    })) return;
    const user = await verifyToken();
    if (epoch !== currentSessionEpoch()) return;
    if (!user) throw new Error('Failed to verify session after sign-in.');
    if (!await saveSession(epoch, token, user, refreshToken ?? null)) return;
    const latestToken = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    if (epoch === currentSessionEpoch()) setState({ token: latestToken, user, isLoading: false });
  }, []);

  /* A sign-in link tapped on the phone. Until this existed the app had no way to take one,
     so a student who signs in by email on the site could not sign in to the app at all. */
  useEffect(() => {
    let done = false;
    const take = (url: string | null) => {
      if (!url || done) return;
      const parsed = Linking.parse(url);
      const authCode = parsed.queryParams?.auth_code;
      if (parsed.hostname !== 'auth' && parsed.path !== 'auth') return;
      if (typeof authCode !== 'string' || !authCode) return;
      done = true;
      finishWithAuthCode(authCode).catch((err) => {
        done = false;
        console.warn('[Auth] Sign-in link could not be used:', err instanceof Error ? err.message : err);
      });
    };
    Linking.getInitialURL().then(take).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => take(url));
    return () => sub.remove();
  }, [finishWithAuthCode]);

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

    await finishWithAuthCode(authCode);
  }, [finishWithAuthCode]);

  const logout = useCallback(async () => {
    // End local access immediately. The server request uses the captured old token and
    // cannot refresh or borrow a new account's session while it is in flight.
    const oldToken = state.token;
    const clearing = clearStoredSession();
    setState({ token: null, user: null, isLoading: false });
    await clearing;
    if (oldToken) void fetch(`${API_URL}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${oldToken}` },
    }).catch(() => {});
  }, [state.token]);

  return { ...state, login, signup, loginWithGoogle, logout };
}
