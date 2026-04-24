package expo.modules.notificationlistener

import android.content.Context
import android.content.SharedPreferences
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.Calendar

class TwinNotificationListenerService : NotificationListenerService() {

  companion object {
    const val PREFS_NAME = "twinme_notif_stats"

    // Delivery/commerce apps whose notification text we read for purchase detection.
    // All other apps: only metadata (package + hour) is collected, content never read.
    private val PURCHASE_APPS = setOf(
      "com.ifood.customer",
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

    // Callback registered by NotificationStatsModule to bridge events to JS
    var purchaseListener: ((pkg: String, appName: String, text: String, amount: String?) -> Unit)? = null

    fun getPrefs(ctx: Context): SharedPreferences =
      ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

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

    // For delivery/commerce apps only: read content and check for purchase events
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

    purchaseListener?.invoke(pkg, appName, displayText, amount)
  }
}
