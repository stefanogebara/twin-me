import { useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { NotificationListenerModule, PurchaseEvent } from '../native/NotificationListenerModule';
import { STORAGE_KEYS } from '../constants';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://twin-ai-learn.vercel.app/api';

/**
 * usePurchaseDetection
 *
 * Listens for purchase events from delivery/commerce apps via the native
 * NotificationListenerService. When a purchase is detected, calls the backend
 * which builds behavioral context (Spotify mood + Calendar load) and sends a
 * WhatsApp reflection to the user.
 *
 * No UI — this hook runs silently in the background once mounted.
 * Mount it in the root navigator so it stays alive across screens.
 */
export function usePurchaseDetection() {
  const inFlight = useRef(false);

  useEffect(() => {
    const sub = NotificationListenerModule.addPurchaseListener(async (event: PurchaseEvent) => {
      // Dedupe: ignore if a reflection is already being generated
      if (inFlight.current) return;
      inFlight.current = true;

      try {
        const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
        if (!token) return;

        await fetch(`${API_BASE}/purchase-notification/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            appName: event.appName,
            packageName: event.packageName,
            notificationText: event.text,
            amount: event.amount || null,
          }),
        });
      } catch {
        // Fire-and-forget — never surface errors to the user
      } finally {
        // Cooldown: one reflection per 5 minutes max
        setTimeout(() => { inFlight.current = false; }, 5 * 60 * 1000);
      }
    });

    return () => { sub?.remove(); };
  }, []);
}
