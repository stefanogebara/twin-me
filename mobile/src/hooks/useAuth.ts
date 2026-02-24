import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants';
import { login as apiLogin, verifyToken } from '../services/api';
import type { User, AuthState } from '../types';

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
    await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);
    await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));
    setState({ token, user, isLoading: false });
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER);
    setState({ token: null, user: null, isLoading: false });
  }, []);

  return { ...state, login, logout };
}
