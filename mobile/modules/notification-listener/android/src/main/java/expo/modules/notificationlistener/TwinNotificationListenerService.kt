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

    /* The money twin's own path. A bank notification is the only way to see a payment on
       the day it happens: the open banking feed carries booked rows one to three days late. */

    /* Spanish banks, by package. Santander first because that is the account this was built
       against; the rest are here so a second account does not need a new release. */
    private val BANK_APPS = setOf(
      "es.bancosantander.apps",
      "es.bancosantander.appempresas",
      "com.bbva.bbvacontigo",
      "es.lacaixa.mobile.android.newwapicon",
      "com.imaginbank.app",
      "es.cm.android",
      "es.ibercaja.ibercajaapp",
      "com.tecnocom.cajarural",
      "es.univia.unicajamovil",
      "es.evobanco.bancamovil",
      "com.rsi",
      "es.openbank.mobile",
      "com.revolut.revolut",
      "com.n26.mobile",
      "es.bankinter.movil",
      // 2026-09-16: Sabadell (its Play id is a legacy name), ING and Wise, the banks the first
      // beta testers actually hold.
      "net.inverline.bancosabadell.officelocator.android",
      "www.ingdirect.nativeframe",
      "com.transferwise.android"
    )

    /* A bank notification that names no money is not a payment: a login alert, a statement
       is ready, a card was activated. The amount is the filter, and it is a better one than
       a keyword list because it does not need to know how a bank phrases things. */
    /* A raw string in Kotlin does not process escapes, so the euro sign is written as the
       character it is; \u20ac inside triple quotes would have matched the six letters. */
    private val EURO = Regex("""(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,2})?\s?(?:EUR\b|€)|€\s?\d""", RegexOption.IGNORE_CASE)

    fun looksLikeMoney(text: String): Boolean = EURO.containsMatchIn(text)

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

    val bankExtras = sbn.notification?.extras
    if (pkg in BANK_APPS && bankExtras != null) {
      val bankTitle = bankExtras.getCharSequence("android.title")?.toString() ?: ""
      val bankText = bankExtras.getCharSequence("android.text")?.toString() ?: ""
      val whole = listOf(bankTitle, bankText).filter { it.isNotBlank() }.joinToString(". ")
      if (looksLikeMoney(whole)) sendCapture(whole, sbn)
      return
    }

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

  /** Android's event identity + original timestamp survive every network retry. */
  private fun sendCapture(text: String, notification: StatusBarNotification) {
    val store = CaptureStore.get(applicationContext)
    val owner = store.credentials()?.owner ?: return
    val identity = "${notification.packageName}|${notification.key}|${notification.postTime}"
    val eventId = java.security.MessageDigest.getInstance("SHA-256")
      .digest(identity.toByteArray()).joinToString("") { "%02x".format(it) }
    val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
    format.timeZone = java.util.TimeZone.getTimeZone("UTC")
    val payload = JSONObject().put("text",text.take(2000)).put("eventId",eventId)
      .put("receivedAt",format.format(java.util.Date(notification.postTime)))
      .put("ownerId",owner).put("app",notification.packageName).toString()
    store.enqueue(owner,eventId,payload)
    CaptureRetryService.schedule(applicationContext)
  }

  private fun triggerFromNative(pkg: String, appName: String, text: String, amount: String) {
    val bgPrefs = getBgPrefs(applicationContext)
    val token = CaptureStore.get(applicationContext).credentials()?.token?.takeIf { it.isNotBlank() }
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
