package expo.modules.notificationlistener

import android.content.Context
import android.content.SharedPreferences
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar

class TwinNotificationListenerService : NotificationListenerService() {

  companion object {
    const val PREFS_NAME = "twinme_notif_stats"
    const val BG_PREFS_NAME = "twinme_bg_prefs"
    private const val API_URL = "https://www.twinme.me/api/purchase-notification/trigger"
    private const val COOLDOWN_MS = 5 * 60 * 1000L

    // Delivery/commerce apps whose notification text we read for purchase detection.
    // All other apps: only metadata (package + hour) is collected, content never read.
    private val PURCHASE_APPS = setOf(
      "br.com.brainweb.ifood",   // iFood BR (actual package)
      "com.ifood.customer",      // iFood legacy
      "com.grability.rappi",     // Rappi BR (actual package)
      "com.rappi.consumer",
      "com.rappi.consumer.br",
      "com.ubercab.eats",
      "br.com.jamesdelivery",
      "com.pedidosya.pedidosya",
      "br.com.americanas.app",
      "com.amazon.mShop.android.shopping",
    )

    // Keywords that signal a purchase was just confirmed (PT-BR + EN)
    private val PURCHASE_KEYWORDS = listOf(
      "pedido confirmado", "pedido recebido", "compra realizada",
      "pagamento confirmado", "pedido aceito", "seu pedido foi",
      "order confirmed", "payment confirmed", "purchase confirmed",
      "order placed", "compra aprovada",
    )

    // Callback registered by NotificationStatsModule to bridge events to JS (foreground only)
    var purchaseListener: ((pkg: String, appName: String, text: String, amount: String?) -> Unit)? = null

    fun getPrefs(ctx: Context): SharedPreferences =
      ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getBgPrefs(ctx: Context): SharedPreferences =
      ctx.getSharedPreferences(BG_PREFS_NAME, Context.MODE_PRIVATE)

    fun extractAmount(text: String): String? {
      val regex = Regex("""R\$\s*(\d+[.,]?\d*)|\$\s*(\d+[.,]?\d*)""")
      return regex.find(text)?.value
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val pkg = sbn.packageName ?: return
    if (pkg == applicationContext.packageName) return

    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val key = "notif_${pkg}_$hour"
    val prefs = getPrefs(applicationContext)
    prefs.edit().putInt(key, prefs.getInt(key, 0) + 1).apply()

    Log.d("TwinNotif", "onNotificationPosted: $pkg inPurchaseApps=${pkg in PURCHASE_APPS}")
    if (pkg !in PURCHASE_APPS) return

    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence("android.title")?.toString() ?: ""
    val text = extras.getCharSequence("android.text")?.toString() ?: ""
    val combined = "$title $text".lowercase()

    val isPurchase = PURCHASE_KEYWORDS.any { combined.contains(it) }
    if (!isPurchase) return

    val displayText = listOf(title, text).filter { it.isNotBlank() }.joinToString(" — ")
    val amount = extractAmount("$title $text")
    val appName = try {
      packageManager.getApplicationLabel(
        packageManager.getApplicationInfo(pkg, 0)
      ).toString()
    } catch (_: Exception) { pkg }

    Log.d("TwinNotif", "Purchase detected! pkg=$pkg appName=$appName amount=$amount")

    // JS bridge — works when app is in foreground
    purchaseListener?.invoke(pkg, appName, displayText, amount)

    // Native HTTP — works always, even when app is killed
    triggerFromNative(pkg, appName, displayText, amount ?: "")
  }

  private fun triggerFromNative(pkg: String, appName: String, text: String, amount: String) {
    val bgPrefs = getBgPrefs(applicationContext)
    val token = bgPrefs.getString("auth_token", null)
    Log.d("TwinNotif", "triggerFromNative token=${if (token != null) "set" else "null"}")
    token ?: return

    val last = bgPrefs.getLong("last_purchase_trigger", 0L)
    if (System.currentTimeMillis() - last < COOLDOWN_MS) return
    bgPrefs.edit().putLong("last_purchase_trigger", System.currentTimeMillis()).apply()

    val body = JSONObject().apply {
      put("appName", appName)
      put("packageName", pkg)
      put("notificationText", text)
      put("amount", amount)
    }.toString()

    Thread {
      try {
        val conn = URL(API_URL).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        conn.doOutput = true
        conn.outputStream.use { it.write(body.toByteArray()) }
        conn.responseCode
        conn.disconnect()
      } catch (_: Exception) {}
    }.start()
  }
}
