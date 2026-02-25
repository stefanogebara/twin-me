package expo.modules.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.BatteryManager
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
        if (lastScreenOn > 0) {
          screenOnMs += (endTime - lastScreenOn)
        }
        promise.resolve(screenOnMs)
      } catch (e: Exception) {
        promise.reject("SCREEN_ERROR", e.message ?: "Unknown error", e)
      }
    }

    // -------------------------------------------------------------------------
    // getAndroidUsageData — rich combined payload for background sync
    //
    // Single queryEvents pass collects everything:
    //   SCREEN_INTERACTIVE/NON_INTERACTIVE  → screen-on time
    //   ACTIVITY_RESUMED                   → launch counts + hourly activity
    //   KEYGUARD_HIDDEN                    → unlock count
    //   SHORTCUT_INVOCATION (8)            → notification tap proxy
    //
    // No-permission extras read synchronously:
    //   BatteryManager                     → level, charging state & type
    //   AudioManager                       → ringer mode (silent/vibrate/normal)
    // -------------------------------------------------------------------------
    AsyncFunction("getAndroidUsageData") { hours: Int, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null || !hasUsagePermission(ctx)) {
        promise.resolve(
          mapOf(
            "capturedAt" to java.time.Instant.now().toString(),
            "appUsage" to emptyList<Any>(),
            "notificationPatterns" to emptyList<Any>(),
            "screenOnTimeMs" to 0L,
            "appLaunchCounts" to emptyList<Any>(),
            "screenUnlockCount" to 0,
            "hourlyActivity" to emptyList<Any>(),
            "batteryInfo" to mapOf("level" to -1, "isCharging" to false, "chargingType" to "unknown"),
            "audioMode" to "unknown"
          )
        )
        return@AsyncFunction
      }
      try {
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val pm = ctx.packageManager
        val endTime = System.currentTimeMillis()
        val startTime = endTime - (hours * 60L * 60L * 1000L)

        // ── App usage (foreground time from queryUsageStats) ──────────────────
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_BEST, startTime, endTime)
          ?: emptyList()
        val appUsage = stats
          .filter { it.totalTimeInForeground > 0 }
          .sortedByDescending { it.totalTimeInForeground }
          .take(30)
          .map { stat ->
            val appName = try {
              pm.getApplicationLabel(pm.getApplicationInfo(stat.packageName, 0)).toString()
            } catch (_: Exception) { stat.packageName }
            mapOf(
              "packageName" to stat.packageName,
              "appName" to appName,
              "totalTimeMs" to stat.totalTimeInForeground,
              "lastUsed" to stat.lastTimeUsed
            )
          }

        // ── Single-pass event scan ────────────────────────────────────────────
        val events = usm.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()

        var screenOnMs = 0L
        var lastScreenOn = -1L

        var screenUnlockCount = 0

        // launch counts: pkg → count
        val launchCounts = mutableMapOf<String, Int>()

        // hourly total usage ms: hour → totalMs (sum of all apps)
        val hourlyMs = mutableMapOf<Int, Long>()
        // hourly unique apps: hour → set of packages
        val hourlyApps = mutableMapOf<Int, MutableSet<String>>()

        // last resume time per package (for session length calc)
        val lastResume = mutableMapOf<String, Long>()

        // notification tap proxy (SHORTCUT_INVOCATION)
        val notifMap = mutableMapOf<String, MutableMap<Int, Int>>()

        while (events.hasNextEvent()) {
          events.getNextEvent(event)
          val cal = java.util.Calendar.getInstance().apply { timeInMillis = event.timeStamp }
          val hour = cal.get(java.util.Calendar.HOUR_OF_DAY)

          when (event.eventType) {
            // ── Screen on/off ────────────────────────────────────────────────
            UsageEvents.Event.SCREEN_INTERACTIVE -> lastScreenOn = event.timeStamp
            UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
              if (lastScreenOn > 0) {
                screenOnMs += (event.timeStamp - lastScreenOn)
                lastScreenOn = -1L
              }
            }

            // ── App opened ───────────────────────────────────────────────────
            UsageEvents.Event.ACTIVITY_RESUMED -> {
              val pkg = event.packageName ?: continue
              launchCounts[pkg] = (launchCounts[pkg] ?: 0) + 1
              lastResume[pkg] = event.timeStamp
              hourlyApps.getOrPut(hour) { mutableSetOf() }.add(pkg)
            }

            // ── App closed — attribute session time to the hour it started ───
            UsageEvents.Event.ACTIVITY_PAUSED -> {
              val pkg = event.packageName ?: continue
              val resumeAt = lastResume.remove(pkg) ?: continue
              val sessionMs = event.timeStamp - resumeAt
              if (sessionMs > 0) {
                val startHour = java.util.Calendar.getInstance()
                  .apply { timeInMillis = resumeAt }
                  .get(java.util.Calendar.HOUR_OF_DAY)
                hourlyMs[startHour] = (hourlyMs[startHour] ?: 0L) + sessionMs
              }
            }

            // ── Unlock ────────────────────────────────────────────────────────
            18 -> screenUnlockCount++ // KEYGUARD_HIDDEN = 18

            // ── Notification tap proxy ────────────────────────────────────────
            8 -> { // SHORTCUT_INVOCATION
              val pkg = event.packageName ?: continue
              notifMap.getOrPut(pkg) { mutableMapOf() }
                .merge(hour, 1) { a, b -> a + b }
            }
          }
        }
        // If screen still on at query end
        if (lastScreenOn > 0) screenOnMs += (endTime - lastScreenOn)

        // ── Build appLaunchCounts with name lookup ────────────────────────────
        val appLaunchCounts = launchCounts.entries
          .sortedByDescending { it.value }
          .take(30)
          .map { (pkg, count) ->
            val appName = try {
              pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (_: Exception) { pkg }
            // avg session length = totalTimeMs / launchCount
            val totalMs = stats.find { it.packageName == pkg }?.totalTimeInForeground ?: 0L
            val avgSessionMs = if (count > 0) totalMs / count else 0L
            mapOf(
              "packageName" to pkg,
              "appName" to appName,
              "launchCount" to count,
              "avgSessionMs" to avgSessionMs
            )
          }

        // ── Build hourlyActivity (0-23) ───────────────────────────────────────
        val hourlyActivity = (0..23).mapNotNull { h ->
          val ms = hourlyMs[h] ?: 0L
          val apps = hourlyApps[h]?.size ?: 0
          if (ms > 0 || apps > 0) mapOf("hour" to h, "activeApps" to apps, "totalMs" to ms)
          else null
        }

        // ── Notification patterns ─────────────────────────────────────────────
        val notificationPatterns = notifMap.flatMap { (pkg, hourMap) ->
          val appName = try {
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
          } catch (_: Exception) { pkg }
          hourMap.map { (hour, count) ->
            mapOf("packageName" to pkg, "appName" to appName, "hour" to hour, "count" to count)
          }
        }

        // ── Battery info (no permission required) ─────────────────────────────
        val batteryIntent = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val batteryLevel = batteryIntent?.let { i ->
          val level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
          val scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
          if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        } ?: -1
        val batteryStatus = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = batteryStatus == BatteryManager.BATTERY_STATUS_CHARGING
          || batteryStatus == BatteryManager.BATTERY_STATUS_FULL
        val chargePlug = batteryIntent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
        val chargingType = when (chargePlug) {
          BatteryManager.BATTERY_PLUGGED_USB -> "usb"
          BatteryManager.BATTERY_PLUGGED_AC -> "ac"
          BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
          else -> "none"
        }
        val batteryInfo = mapOf(
          "level" to batteryLevel,
          "isCharging" to isCharging,
          "chargingType" to chargingType
        )

        // ── Audio / ringer mode (no permission required) ──────────────────────
        val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val audioMode = when (audio.ringerMode) {
          AudioManager.RINGER_MODE_SILENT -> "silent"
          AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
          else -> "normal"
        }

        promise.resolve(
          mapOf(
            "capturedAt" to java.time.Instant.now().toString(),
            "appUsage" to appUsage,
            "notificationPatterns" to notificationPatterns,
            "screenOnTimeMs" to screenOnMs,
            "appLaunchCounts" to appLaunchCounts,
            "screenUnlockCount" to screenUnlockCount,
            "hourlyActivity" to hourlyActivity,
            "batteryInfo" to batteryInfo,
            "audioMode" to audioMode
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
