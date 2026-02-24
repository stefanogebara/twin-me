/**
 * UsageStatsModule — TypeScript wrapper for the native Android UsageStats module.
 *
 * On iOS or when the native module is not linked (Expo Go), all calls
 * return empty/default values gracefully.
 *
 * REQUIRES:
 *  - `expo prebuild` (generates native Android project)
 *  - AndroidManifest.xml: <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" tools:ignore="ProtectedPermissions"/>
 *  - User must manually grant "Usage access" in system Settings
 */
export { UsageStatsModule } from '../../modules/usage-stats/src';
