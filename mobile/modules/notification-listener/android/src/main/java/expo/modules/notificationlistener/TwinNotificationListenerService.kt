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
    private const val CAPTURE_URL = "https://www.twinme.me/api/money/capture"

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
      "es.bankinter.movil"
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
      if (looksLikeMoney(whole)) sendCapture(whole)
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

  /**
   * A bank notification, sent on verbatim. The server does the reading: it already parses
   * Spanish wordings and knows the shop, the amount, the card and the direction, and having
   * one parser rather than two means the phone never disagrees with the ledger.
   *
   * There is deliberately NO cooldown here. The delivery path above drops anything inside
   * five minutes, which is right for an order confirmation arriving twice and catastrophic
   * for a bank: a coffee and a metro ticket four minutes apart are two payments, and losing
   * the second is a hole in the ledger nobody would ever notice. Instead an identical text
   * inside a minute is skipped, which is Android reposting one notification, not a person
   * paying the same amount twice.
   */
  private fun sendCapture(text: String) {
    val bgPrefs = getBgPrefs(applicationContext)
    /* A capture key, not the session token. This service runs for months without the app
       being opened, and a JWT would expire quietly and take every payment with it. A key
       does not expire, and the person can revoke it without touching their password. */
    val captureKey = bgPrefs.getString("capture_key", null)
    val token = bgPrefs.getString("auth_token", null)
    if (captureKey == null && token == null) return

    val signature = text.hashCode().toString()
    val lastSignature = bgPrefs.getString("last_capture_sig", null)
    val lastAt = bgPrefs.getLong("last_capture_at", 0L)
    val now = System.currentTimeMillis()
    if (signature == lastSignature && now - lastAt < 60_000L) return
    bgPrefs.edit().putString("last_capture_sig", signature).putLong("last_capture_at", now).apply()

    Log.d("TwinNotif", "capture -> ${text.take(48)}")

    Thread {
      /* Anything a previous notification could not deliver goes first, oldest attempt
         first, so a lost afternoon of payments arrives on the next one rather than sitting
         in a queue nobody drains. */
      val pending = bgPrefs.getStringSet("pending_captures", emptySet())?.toMutableSet() ?: mutableSetOf()
      val queue = pending.toMutableList()
      queue.add(text)
      val undelivered = mutableSetOf<String>()
      for (item in queue) {
        if (!postCapture(item, captureKey, token)) {
          /* The phone is the only witness to a payment on the day it happened, so a failed
             send is kept rather than dropped. Fifty is a fortnight of a student's spending;
             past that the ledger will catch up from the bank anyway. */
          if (undelivered.size < 50) undelivered.add(item)
        }
      }
      bgPrefs.edit().putStringSet("pending_captures", undelivered).apply()
    }.start()
  }

  /** One capture, sent. True when the server took it. */
  private fun postCapture(text: String, captureKey: String?, token: String?): Boolean {
    return try {
      val conn = URL(CAPTURE_URL).openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      if (captureKey != null) conn.setRequestProperty("X-TwinMe-Key", captureKey)
      else conn.setRequestProperty("Authorization", "Bearer $token")
      conn.setRequestProperty("Content-Type", "application/json")
      conn.connectTimeout = 15_000
      conn.readTimeout = 15_000
      conn.doOutput = true
      conn.outputStream.use { it.write(JSONObject().apply { put("text", text) }.toString().toByteArray()) }
      val code = conn.responseCode
      conn.disconnect()
      Log.d("TwinNotif", "capture response $code")
      /* A refusal is not a network problem: the server read it and said no, and retrying
         forever would be a loop. Only a failure to reach it is worth keeping. */
      code < 500
    } catch (e: Exception) {
      Log.d("TwinNotif", "capture failed, kept for later: ${e.message}")
      false
    }
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
