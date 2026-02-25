package expo.modules.notificationlistener

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationStatsModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("NotificationStats")

    // -------------------------------------------------------------------------
    // hasNotificationPermission — checks NotificationListenerService is enabled
    // -------------------------------------------------------------------------
    Function("hasNotificationPermission") {
      val ctx = appContext.reactContext ?: return@Function false
      NotificationManagerCompat.getEnabledListenerPackages(ctx)
        .contains(ctx.packageName)
    }

    // -------------------------------------------------------------------------
    // requestNotificationPermission — opens system Settings
    // -------------------------------------------------------------------------
    Function("requestNotificationPermission") {
      appContext.reactContext?.let { ctx ->
        ctx.startActivity(
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
    }

    // -------------------------------------------------------------------------
    // getNotificationStats — reads accumulated counters from SharedPreferences
    // -------------------------------------------------------------------------
    AsyncFunction("getNotificationStats") { promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.resolve(emptyList<Map<String, Any>>())
        return@AsyncFunction
      }
      try {
        val pm = ctx.packageManager
        val prefs = TwinNotificationListenerService.getPrefs(ctx)
        val all = prefs.all

        // Group keys "notif_{pkg}_{hour}" → list of {packageName, appName, hour, count}
        val result = all
          .entries
          .filter { it.key.startsWith("notif_") && it.value is Int }
          .map { entry ->
            val parts = entry.key.removePrefix("notif_").split("_")
            // packageName may contain underscores — split from the end
            val hour = parts.last().toIntOrNull() ?: 0
            val pkg = parts.dropLast(1).joinToString("_")
            val appName = try {
              pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (_: Exception) { pkg }
            mapOf(
              "packageName" to pkg,
              "appName" to appName,
              "hour" to hour,
              "count" to (entry.value as Int)
            )
          }
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("NOTIF_STATS_ERROR", e.message ?: "Unknown error", e)
      }
    }

    // -------------------------------------------------------------------------
    // clearStats — wipes all stored counters (call after successful upload)
    // -------------------------------------------------------------------------
    Function("clearStats") {
      appContext.reactContext?.let { ctx ->
        TwinNotificationListenerService.getPrefs(ctx).edit().clear().apply()
      }
    }
  }
}
