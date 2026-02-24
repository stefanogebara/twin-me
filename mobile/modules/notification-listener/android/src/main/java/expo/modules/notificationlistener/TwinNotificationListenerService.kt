package expo.modules.notificationlistener

import android.content.Context
import android.content.SharedPreferences
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.Calendar

/**
 * TwinNotificationListenerService
 * ================================
 * Passive notification metadata collector — captures ONLY:
 *   - Which app posted a notification (packageName)
 *   - Which hour of the day it arrived (0-23)
 *
 * Notification TITLE, TEXT, and CONTENT are never read or stored.
 *
 * Data is accumulated in SharedPreferences under keys:
 *   "notif_{packageName}_{hour}" → Int count
 *
 * The NotificationStatsModule reads and optionally clears this store.
 *
 * Manifest registration is handled by the config plugin (plugin/index.js).
 * The service requires BIND_NOTIFICATION_LISTENER_SERVICE permission,
 * which the user grants in Settings → Notifications → Notification access.
 */
class TwinNotificationListenerService : NotificationListenerService() {

  companion object {
    const val PREFS_NAME = "twinme_notif_stats"

    fun getPrefs(ctx: Context): SharedPreferences =
      ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val pkg = sbn.packageName ?: return

    // Ignore our own app's notifications to avoid feedback loops
    if (pkg == applicationContext.packageName) return

    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val key = "notif_${pkg}_$hour"

    val prefs = getPrefs(applicationContext)
    val current = prefs.getInt(key, 0)
    prefs.edit().putInt(key, current + 1).apply()
  }

  // onNotificationRemoved intentionally not implemented — we only track arrival
}
