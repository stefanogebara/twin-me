/**
 * app.config.js — Dynamic Expo config for TwinMe
 *
 * Using a JS config (instead of static app.json) allows us to conditionally
 * include Android-only plugins so iOS builds don't fail on native Android modules.
 *
 * Android-only plugins/packages:
 *   - ./modules/notification-listener/plugin  (BIND_NOTIFICATION_LISTENER_SERVICE)
 *   - react-native-android-widget             (home screen widget)
 */

const IS_ANDROID = process.env.EAS_BUILD_PLATFORM === 'android';

/** @type {import('@expo/config').ExpoConfig} */
const config = {
  name: 'TwinMe',
  slug: 'twinme-android',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  scheme: 'twinme',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#faf9f8',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.twinme.app',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'TwinMe uses your location to understand your daily patterns and home/work split.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'TwinMe uses background location to track daily rhythm patterns.',
      NSCameraUsageDescription:
        'TwinMe uses the camera to let you set a profile photo.',
      NSPhotoLibraryUsageDescription:
        'TwinMe accesses your photo library so you can choose a profile picture.',
      NSMicrophoneUsageDescription:
        'TwinMe uses the microphone for voice notes.',
    },
    entitlements: {
      'aps-environment': 'production',
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.twinme.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#faf9f8',
    },
    edgeToEdgeEnabled: true,
    permissions: [
      'android.permission.PACKAGE_USAGE_STATS',
      'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.INTERNET',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.WAKE_LOCK',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'TwinMe uses your location to understand your daily patterns.',
      },
    ],
    'expo-router',
    'expo-font',
    'expo-background-fetch',
    'expo-task-manager',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#8b5cf6',
      },
    ],
    // Android-only plugins — excluded from iOS builds to prevent prebuild errors
    ...(IS_ANDROID
      ? [
          './modules/notification-listener/plugin/index.js',
          [
            'react-native-android-widget',
            {
              widgets: [
                {
                  name: 'TwinInsight',
                  label: 'Twin Insight',
                  description: 'Your latest soul signature insight',
                  previewImage: './assets/widget-preview.png',
                  minWidth: '180dp',
                  minHeight: '110dp',
                  resizable: 'horizontal',
                  updatePeriodMillis: 1800000,
                },
              ],
            },
          ],
        ]
      : []),
  ],
  extra: {
    eas: {
      projectId: 'e89509e4-162c-4501-b6e4-73ad9b56ebe8',
    },
    router: {},
  },
  owner: 'stefanogebara',
};

module.exports = config;
