package expo.modules.notificationlistener

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/** OS-scheduled retries survive process death and do not need another purchase to arrive. */
class CaptureRetryService : JobService() {
  companion object {
    private const val IMMEDIATE = 7401
    private const val PERIODIC = 7402
    private val executor = Executors.newSingleThreadExecutor()
    fun schedule(context: Context) {
      val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
      val component = ComponentName(context, CaptureRetryService::class.java)
      if (scheduler.getPendingJob(PERIODIC) == null) scheduler.schedule(JobInfo.Builder(PERIODIC, component)
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setPeriodic(15*60*1000L).build())
      if (scheduler.getPendingJob(IMMEDIATE) == null) scheduler.schedule(JobInfo.Builder(IMMEDIATE, component)
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setBackoffCriteria(30_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build())
    }
    fun cancel(context: Context) {
      val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
      scheduler.cancel(IMMEDIATE); scheduler.cancel(PERIODIC)
    }
  }
  private val cancelled = ConcurrentHashMap<Int, AtomicBoolean>()
  override fun onStartJob(params: JobParameters): Boolean {
    val stopped = AtomicBoolean(false)
    cancelled.put(params.jobId, stopped)?.set(true)
    executor.execute {
      var retry = false
      try {
        val store = CaptureStore.get(applicationContext)
        val auth = store.credentials()
        if (auth != null && auth.key.isNotBlank()) {
          for (event in store.pending(auth.owner)) {
            if (stopped.get() || store.credentials()?.owner != auth.owner) break
            val outcome = deliver(event.payload, auth.key)
            when (outcome) {
              "retry" -> { retry = true; break }
              "auth" -> { store.pauseAuthorization(auth.owner); break }
              else -> store.mark(auth.owner,event.id,outcome)
            }
          }
          retry = retry || store.count() > 0
        }
      } catch (_: Exception) { retry = true }
      cancelled.remove(params.jobId, stopped)
      if (!stopped.get()) jobFinished(params, retry)
    }
    return true
  }
  override fun onStopJob(params: JobParameters): Boolean { cancelled.remove(params.jobId)?.set(true); return true }

  private fun deliver(payload: String, key: String): String {
    var connection: HttpURLConnection? = null
    return try {
      connection = URL("https://www.twinme.me/api/money/capture").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.setRequestProperty("X-TwinMe-Key",key)
      connection.setRequestProperty("Content-Type","application/json")
      connection.connectTimeout = 10_000; connection.readTimeout = 10_000
      connection.doOutput = true
      connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
      val outcome = captureOutcome(connection.responseCode)
      if (outcome == "sent" && !org.json.JSONObject(connection.inputStream.bufferedReader().use { it.readText() }).optBoolean("success")) "retry" else outcome
    } catch (_: Exception) { "retry" }
    finally { connection?.disconnect() }
  }
}

/** Kept pure so status semantics are checked without a phone or network. */
internal fun captureOutcome(code: Int): String = when {
  code in 200..299 -> "sent"
  code == 401 || code == 403 -> "auth"
  code == 408 || code == 429 || code >= 500 -> "retry"
  else -> "failed" // Retained and visible, never silently acknowledged.
}
