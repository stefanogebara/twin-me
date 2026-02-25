import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { STORAGE_KEYS, API_URL, OAUTH_API_URL } from '../constants';
import { login as apiLogin, register as apiRegister, claimAuthCode, verifyToken } from '../services/api';
import type { User, AuthState } from '../types';

WebBrowser.maybeCompleteAuthSession();

async function saveSession(token: string, user: User) {
  await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);
  await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    isLoading: true,
  });

  // On mount: load saved token and verify it
  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) {
        setState({ token: null, user: null, isLoading: false });
        return;
      }
      const user = await verifyToken();
      if (user) {
        setState({ token, user, isLoading: false });
      } else {
        await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
        setState({ token: null, user: null, isLoading: false });
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await apiLogin(email, password);
    await saveSession(token, user);
    setState({ token, user, isLoading: false });
  }, []);

  const signup = useCallback(async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => {
    const { token, user } = await apiRegister(email, password, firstName, lastName);
    await saveSession(token, user);
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

    const { token } = await claimAuthCode(authCode);
    await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);

    // Verify to get user object
    const user = await verifyToken();
    if (!user) throw new Error('Failed to verify session after Google sign-in.');

    await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));
    setState({ token, user, isLoading: false });
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER);
    setState({ token: null, user: null, isLoading: false });
  }, []);

  return { ...state, login, signup, loginWithGoogle, logout };
}
