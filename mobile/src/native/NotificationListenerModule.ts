/**
 * NotificationListenerModule — TypeScript wrapper for the native Android
 * NotificationListenerService module.
 *
 * On iOS or when the native module is not linked (Expo Go), all calls
 * return empty/default values gracefully.
 *
 * REQUIRES:
 *  - `expo prebuild` (generates native Android project with service registration)
 *  - User must grant "Notification access" in Settings → Notifications
 */
export { NotificationListenerModule } from '../../modules/notification-listener/src';
