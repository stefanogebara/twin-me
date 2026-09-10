/**
 * app.config.js: the one Expo config for TwinMe.
 *
 * The app reads a bank account and, on Android, the bank's own notifications. That is the whole
 * list of things it asks the phone for. No location, no camera, no microphone, no health data,
 * no push, no widget: a permission the product does not use is a question the person should
 * never be asked.
 */

const IS_ANDROID = process.env.EAS_BUILD_PLATFORM === 'android';

/** Paper, the colour of every screen, so the splash and the icon are the app before it opens. */
const PAPER = '#fbfaf8';

/** @type {import('@expo/config').ExpoConfig} */
const config = {
  name: 'TwinMe',
  slug: 'twinme-android',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: PAPER,
  newArchEnabled: true,
  scheme: 'twinme',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.twinme.app',
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.twinme.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: PAPER,
    },
    edgeToEdgeEnabled: true,
    permissions: [
      'android.permission.INTERNET',
      // The notification listener: bound by the system, kept alive across reboots, and allowed
      // to finish sending a payment the moment it is announced.
      'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.WAKE_LOCK',
    ],
    /* The template adds these; the product uses none of them, and a permission nobody uses is
       a question the person should never be asked. */
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-secure-store',
    'expo-font',
    'expo-system-ui',
    /* The splash is the app's own mark on paper: the same ink pill the icon carries, small,
       centred, on the canvas every screen uses. The plugin owns the native resources for it. */
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: PAPER,
      },
    ],
    // Android only: the plugin declares the listener service in the manifest.
    ...(IS_ANDROID ? ['./modules/notification-listener/plugin/index.js'] : []),
  ],
  extra: {
    eas: {
      projectId: 'e89509e4-162c-4501-b6e4-73ad9b56ebe8',
    },
  },
  owner: 'stefanogebara',
};

module.exports = config;
