/**
 * Push Notification Registration
 * ================================
 * Requests permission, obtains the Expo push token, and registers it
 * with the backend. Safe to call on every app launch — the backend
 * upserts on (user_id, token) so duplicates are handled.
 *
 * Also sets up foreground notification behaviour (show banner while app
 * is open) and returns a cleanup function for event listeners.
 *
 * Tap routing: when the user taps a notification, `notificationType`
 * in the data payload determines which screen to navigate to:
 *   insight     → Home (twin insights visible)
 *   goal        → Goals screen
 *   reflection  → Soul Signature screen
 *   chat        → Talk to Twin screen
 *   (default)   → Home
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { authFetch } from './api';

// Show notifications as banners even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Map notificationType → tab/screen name used in navigation */
const NOTIFICATION_TYPE_TO_SCREEN: Record<string, string> = {
  insight: 'Home',
  goal: 'Goals',
  reflection: 'SoulSignature',
  chat: 'TalkToTwin',
};

/**
 * Register this device for push notifications.
 * Returns the Expo push token string, or null if permission denied / not a device.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('[Push] Skipping: not a physical device');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission denied');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('twin-insights', {
      name: 'Twin Insights',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8b5cf6',
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  // Register with backend (fire-and-forget — don't block app startup)
  authFetch('/device-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: Platform.OS, token_type: 'expo' }),
  }).catch((err) => console.warn('[Push] Token registration failed:', err.message));

  return token;
}

/**
 * Set up a listener that handles notification taps and navigates the user
 * to the relevant screen. Must be called once from App.tsx / root component.
 *
 * Returns a cleanup function — call it on component unmount.
 *
 * @param navigate - React Navigation dispatch function:
 *   `(screenName: string) => navigation.navigate(screenName)`
 */
export function setupNotificationTapHandler(
  navigate: (screen: string) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const notificationType = (data?.notificationType as string) ?? 'insight';
      const screen = NOTIFICATION_TYPE_TO_SCREEN[notificationType] ?? 'Home';

      console.log(`[Push] Tapped notification type="${notificationType}" → navigating to ${screen}`);
      navigate(screen);
    }
  );

  return () => subscription.remove();
}

/**
 * Unregister a push token on logout so the user stops receiving
 * notifications after signing out.
 */
export async function unregisterPushToken(token: string): Promise<void> {
  await authFetch(`/device-tokens/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  }).catch((err) => console.warn('[Push] Token removal failed:', err.message));
}
