package expo.modules.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UsageStatsModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("UsageStats")

    // -------------------------------------------------------------------------
    // hasUsagePermission — synchronous check via AppOps
    // -------------------------------------------------------------------------
    Function("hasUsagePermission") {
      hasUsagePermission(appContext.reactContext ?: return@Function false)
    }

    // -------------------------------------------------------------------------
    // requestUsagePermission — opens system Settings
    // -------------------------------------------------------------------------
    Function("requestUsagePermission") {
      appContext.reactContext?.let { ctx ->
        ctx.startActivity(
          Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
    }

    // -------------------------------------------------------------------------
    // getAppUsage — top apps by foreground time
    // -------------------------------------------------------------------------
    AsyncFunction("getAppUsage") { hours: Int, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null || !hasUsagePermission(ctx)) {
        promise.resolve(emptyList<Map<String, Any>>())
        return@AsyncFunction
      }
      try {
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val endTime = System.currentTimeMillis()
        val startTime = endTime - (hours * 60L * 60L * 1000L)

        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_BEST, startTime, endTime)
          ?: emptyList()

        val pm = ctx.packageManager
        val result = stats
          .filter { it.totalTimeInForeground > 0 }
          .sortedByDescending { it.totalTimeInForeground }
          .take(30)
          .map { stat ->
            val appName = try {
              pm.getApplicationLabel(pm.getApplicationInfo(stat.packageName, 0)).toString()
            } catch (_: Exception) {
              stat.packageName
            }
            mapOf(
              "packageName" to stat.packageName,
              "appName" to appName,
              "totalTimeMs" to stat.totalTimeInForeground,
              "lastUsed" to stat.lastTimeUsed
            )
          }
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("USAGE_ERROR", e.message ?: "Unknown error", e)
      }
    }

    // -------------------------------------------------------------------------
    // getScreenOnTimeMs — sum of SCREEN_INTERACTIVE events
    // -------------------------------------------------------------------------
    AsyncFunction("getScreenOnTimeMs") { hours: Int, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null || !hasUsagePermission(ctx)) {
        promise.resolve(0L)
        return@AsyncFunction
      }
      try {
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val endTime = System.currentTimeMillis()
        val startTime = endTime - (hours * 60L * 60L * 1000L)

        val events = usm.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()
        var screenOnMs = 0L
        var lastScreenOn = -1L

        while (events.hasNextEvent()) {
          events.getNextEvent(event)
          when (event.eventType) {
            UsageEvents.Event.SCREEN_INTERACTIVE -> lastScreenOn = event.timeStamp
            UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
              if (lastScreenOn > 0) {
                screenOnMs += (event.timeStamp - lastScreenOn)
                lastScreenOn = -1L
              }
            }
          }
        }
        // If screen is still on at query end
        if (lastScreenOn > 0) {
          screenOnMs += (endTime - lastScreenOn)
        }
        promise.resolve(screenOnMs)
      } catch (e: Exception) {
        promise.reject("SCREEN_ERROR", e.message ?: "Unknown error", e)
      }
    }

    // -------------------------------------------------------------------------
    // getAndroidUsageData — combined payload for background sync
    // -------------------------------------------------------------------------
    AsyncFunction("getAndroidUsageData") { hours: Int, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null || !hasUsagePermission(ctx)) {
        promise.resolve(
          mapOf(
            "capturedAt" to java.time.Instant.now().toString(),
            "appUsage" to emptyList<Any>(),
            "notificationPatterns" to emptyList<Any>(),
            "screenOnTimeMs" to 0L
          )
        )
        return@AsyncFunction
      }
      try {
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val pm = ctx.packageManager
        val endTime = System.currentTimeMillis()
        val startTime = endTime - (hours * 60L * 60L * 1000L)

        // App usage
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_BEST, startTime, endTime)
          ?: emptyList()
        val appUsage = stats
          .filter { it.totalTimeInForeground > 0 }
          .sortedByDescending { it.totalTimeInForeground }
          .take(30)
          .map { stat ->
            val appName = try {
              pm.getApplicationLabel(pm.getApplicationInfo(stat.packageName, 0)).toString()
            } catch (_: Exception) {
              stat.packageName
            }
            mapOf(
              "packageName" to stat.packageName,
              "appName" to appName,
              "totalTimeMs" to stat.totalTimeInForeground,
              "lastUsed" to stat.lastTimeUsed
            )
          }

        // Screen on time via events
        val events = usm.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()
        var screenOnMs = 0L
        var lastScreenOn = -1L
        // Notification launch counts per app per hour
        val notifMap = mutableMapOf<String, MutableMap<Int, Int>>()

        while (events.hasNextEvent()) {
          events.getNextEvent(event)
          when (event.eventType) {
            UsageEvents.Event.SCREEN_INTERACTIVE -> lastScreenOn = event.timeStamp
            UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
              if (lastScreenOn > 0) {
                screenOnMs += (event.timeStamp - lastScreenOn)
                lastScreenOn = -1L
              }
            }
            // SHORTCUT_INVOCATION (type 8) is often a notification tap proxy
            8 -> {
              val pkg = event.packageName ?: continue
              val hour = java.util.Calendar.getInstance().apply {
                timeInMillis = event.timeStamp
              }.get(java.util.Calendar.HOUR_OF_DAY)
              notifMap.getOrPut(pkg) { mutableMapOf() }
                .merge(hour, 1) { a, b -> a + b }
            }
          }
        }
        if (lastScreenOn > 0) screenOnMs += (endTime - lastScreenOn)

        val notificationPatterns = notifMap.flatMap { (pkg, hourMap) ->
          val appName = try {
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
          } catch (_: Exception) { pkg }
          hourMap.map { (hour, count) ->
            mapOf(
              "packageName" to pkg,
              "appName" to appName,
              "hour" to hour,
              "count" to count
            )
          }
        }

        promise.resolve(
          mapOf(
            "capturedAt" to java.time.Instant.now().toString(),
            "appUsage" to appUsage,
            "notificationPatterns" to notificationPatterns,
            "screenOnTimeMs" to screenOnMs
          )
        )
      } catch (e: Exception) {
        promise.reject("DATA_ERROR", e.message ?: "Unknown error", e)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private fun hasUsagePermission(ctx: Context): Boolean {
    val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        android.os.Process.myUid(),
        ctx.packageName
      )
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        android.os.Process.myUid(),
        ctx.packageName
      )
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }
}
