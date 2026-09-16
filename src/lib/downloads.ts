/**
 * Where the two phone pieces are downloaded from.
 *
 * Android gets an app, which reads the bank's own notifications. iPhone gets a Shortcut,
 * because no app there may read another app's notifications. Both addresses live here so the
 * Sources page and the first-minutes steps offer the same thing, and an environment variable
 * can point the app somewhere else (a Play listing, a newer build) without a release.
 */
export const APK_URL = (import.meta.env.VITE_ANDROID_APK_URL as string | undefined)
  || 'https://lurebwaudisfilhuhmnj.supabase.co/storage/v1/object/public/downloads/twinme-android-1.0.0.apk';

export const SHORTCUT_URL = '/downloads/TwinMe-payments.shortcut';

/** Which phone is reading this page, as far as the browser will say. */
export function phoneKind(): 'android' | 'iphone' | 'other' {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iphone';
  return 'other';
}
