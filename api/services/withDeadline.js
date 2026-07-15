/**
 * withDeadline — bound a best-effort promise to a wall-clock budget.
 * ================================================================
 * Resolves with the inner promise's value if it settles within `ms`; otherwise
 * resolves with `fallback` at the deadline. The timer is cleared the moment the
 * inner promise settles, so a fast path never leaves a dangling handle.
 *
 * Why this exists: observation ingestion awaits its backgroundJobs (incl. the
 * soul-signature cache warm — 10-28s when stale) before returning, on purpose,
 * so Vercel doesn't freeze the function mid-write. When that warm ran long the
 * whole ingestion cron blew Vercel's 60s ceiling and 504'd (live 2026-07-15).
 * Bounding the warm keeps the function under budget; abandoning it is safe — the
 * soul-signature cache has a daily regen cron plus serve-stale-then-revalidate,
 * so the next read (or the 06:00 cron) re-warms it.
 *
 * A rejection from `promise` BEFORE the deadline propagates (rejects) — callers
 * that want fully best-effort behaviour attach their own `.catch()`.
 *
 * @template T
 * @param {Promise<T>|T} promise  work to bound (a plain value resolves immediately)
 * @param {number} ms             deadline in milliseconds
 * @param {T|undefined} [fallback] value to resolve with if the deadline hits first
 * @returns {Promise<T|undefined>}
 */
export function withDeadline(promise, ms, fallback = undefined) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    // Never let the deadline timer alone keep the process alive.
    if (timer && typeof timer.unref === 'function') timer.unref();
  });

  const settled = Promise.resolve(promise).then(
    (value) => { clearTimeout(timer); return value; },
    (err) => { clearTimeout(timer); throw err; }
  );

  return Promise.race([settled, deadline]);
}

export default withDeadline;
