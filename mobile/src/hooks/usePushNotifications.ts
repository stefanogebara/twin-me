import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications } from '../services/pushNotifications';

/**
 * Call once after login. Registers for push, then sets up listeners for:
 *   - Foreground notification received  (just logs — handler shows banner)
 *   - Notification tapped               (navigate to twin chat)
 *
 * @param onTap  Called with notification data when user taps a push banner.
 */
export function usePushNotifications(onTap?: (data: Record<string, unknown>) => void) {
  const receivedSub = useRef<Notifications.Subscription | null>(null);
  const responseSub = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    registerForPushNotifications().catch((err) =>
      console.warn('[Push] Registration error:', err)
    );

    receivedSub.current = Notifications.addNotificationReceivedListener((notif) => {
      console.log('[Push] Received:', notif.request.content.title);
    });

    responseSub.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      console.log('[Push] Tapped:', data);
      onTap?.(data);
    });

    return () => {
      receivedSub.current?.remove();
      responseSub.current?.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
