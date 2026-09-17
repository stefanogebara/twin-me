package expo.modules.notificationlistener

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Durable, encrypted evidence. Each event stays with its owner, including across logout. */
class CaptureStore private constructor(private val context: Context) : SQLiteOpenHelper(context, "money_capture_v2.db", null, 1) {
  data class Credentials(val owner: String, val token: String, val key: String)
  data class Event(val id: String, val payload: String)
  private val prefs = context.getSharedPreferences("money_capture_v2", Context.MODE_PRIVATE)
  private val alias = "twinme.money.capture.v2"

  companion object {
    @Volatile private var instance: CaptureStore? = null
    fun get(context: Context): CaptureStore = instance ?: synchronized(this) {
      instance ?: CaptureStore(context.applicationContext).also { instance = it }
    }
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE events(owner TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,PRIMARY KEY(owner,id))")
    db.execSQL("CREATE INDEX pending_owner ON events(owner,state,created_at)")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  private fun secret(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  private fun seal(text: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secret())
    return Base64.encodeToString(cipher.iv + cipher.doFinal(text.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
  }
  private fun open(text: String): String {
    val bytes = Base64.decode(text, Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secret(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
    return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
  }

  @Synchronized fun credentials(): Credentials? = try {
    prefs.getString("session", null)?.let { value ->
      val obj = JSONObject(open(value))
      Credentials(obj.getString("owner"), obj.optString("token"), obj.optString("key"))
    }
  } catch (_: Exception) { null } // A restored backup cannot decrypt another device's keystore.

  @Synchronized fun activate(owner: String, token: String) {
    val previous = credentials()
    save(Credentials(owner, token, if (previous?.owner == owner) previous.key else ""))
    retireLegacy()
  }
  @Synchronized fun setKey(owner: String, key: String) {
    val current = credentials() ?: return
    if (current.owner != owner) return
    save(current.copy(key = key))
    writableDatabase.execSQL("UPDATE events SET state='pending' WHERE owner=? AND state='auth'", arrayOf(owner))
  }
  private fun save(value: Credentials) {
    val text = JSONObject().put("owner", value.owner).put("token", value.token).put("key", value.key).toString()
    check(prefs.edit().putString("session", seal(text)).commit()) { "Cannot save capture credentials" }
  }
  @Synchronized fun detach() {
    prefs.edit().remove("session").commit()
    retireLegacy()
  }

  private fun retireLegacy() {
    val legacy = TwinNotificationListenerService.getBgPrefs(context)
    val queue = legacy.getString("pending_captures", null)
    if (!queue.isNullOrBlank() && queue != "[]") {
      // Preserve uncertain-owner evidence for recovery, encrypted and never auto-delivered.
      check(prefs.edit().putString("legacy_unassigned", seal(queue)).commit())
    }
    check(legacy.edit().remove("auth_token").remove("capture_key").remove("pending_captures").commit())
  }

  @Synchronized fun enqueue(owner: String, id: String, payload: String) {
    if (credentials()?.owner != owner) return
    val waiting = readableDatabase.rawQuery("SELECT count(*) FROM events WHERE owner=? AND state<>'sent'", arrayOf(owner)).use { it.moveToFirst(); it.getInt(0) }
    if (waiting >= 5000) {
      // Explicit degraded state, never claim that overflow was delivered. The bank remains
      // the recovery source; the phone shows the count requiring reconciliation.
      val key = "overflow_$owner"
      prefs.edit().putInt(key, prefs.getInt(key,0)+1).commit()
      return
    }
    writableDatabase.execSQL("INSERT OR IGNORE INTO events(owner,id,payload,created_at) VALUES(?,?,?,?)", arrayOf(owner,id,seal(payload),System.currentTimeMillis()))
    // Successful deliveries are replay guards, not an indefinite notification archive.
    writableDatabase.execSQL("DELETE FROM events WHERE state='sent' AND created_at<?", arrayOf(System.currentTimeMillis()-7*86400000L))
  }
  @Synchronized fun pending(owner: String): List<Event> {
    val events = mutableListOf<Event>()
    readableDatabase.rawQuery("SELECT id,payload FROM events WHERE owner=? AND state='pending' ORDER BY created_at LIMIT 20", arrayOf(owner)).use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getString(0)
        try { events.add(Event(id,open(cursor.getString(1)))) }
        catch (_: Exception) { mark(owner,id,"failed") }
      }
    }
    return events
  }
  @Synchronized fun mark(owner: String, id: String, state: String) {
    writableDatabase.execSQL("UPDATE events SET state=? WHERE owner=? AND id=?", arrayOf(state,owner,id))
  }
  @Synchronized fun pauseAuthorization(owner: String) {
    writableDatabase.execSQL("UPDATE events SET state='auth' WHERE owner=? AND state='pending'", arrayOf(owner))
  }
  @Synchronized fun count(failed: Boolean = false): Int {
    val owner = credentials()?.owner ?: return 0
    val where = if (failed) "state IN ('failed','auth')" else "state='pending'"
    readableDatabase.rawQuery("SELECT count(*) FROM events WHERE owner=? AND $where", arrayOf(owner)).use { return (if (it.moveToFirst()) it.getInt(0) else 0) + (if (failed) prefs.getInt("overflow_$owner",0) else 0) }
  }
}
