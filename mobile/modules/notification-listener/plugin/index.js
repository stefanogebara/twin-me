/**
 * Expo config plugin — NotificationListenerService
 *
 * Adds to AndroidManifest.xml during `expo prebuild`:
 *
 *   <service
 *     android:name="expo.modules.notificationlistener.TwinNotificationListenerService"
 *     android:label="TwinMe Notification Listener"
 *     android:exported="false"
 *     android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
 *     <intent-filter>
 *       <action android:name="android.service.notification.NotificationListenerService" />
 *     </intent-filter>
 *   </service>
 */

const { withAndroidManifest } = require('@expo/config-plugins');

function withNotificationListenerService(config) {
  return withAndroidManifest(config, async (mod) => {
    const manifest = mod.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) return mod;

    const serviceName =
      'expo.modules.notificationlistener.TwinNotificationListenerService';

    // Avoid duplicate entries on repeated prebuild runs
    const existing = (application.service ?? []).find(
      (s) => s.$?.['android:name'] === serviceName
    );
    if (existing) return mod;

    if (!application.service) application.service = [];

    application.service.push({
      $: {
        'android:name': serviceName,
        'android:label': 'TwinMe Notification Listener',
        'android:exported': 'false',
        'android:permission':
          'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name':
                  'android.service.notification.NotificationListenerService',
              },
            },
          ],
        },
      ],
    });

    return mod;
  });
}

module.exports = withNotificationListenerService;
