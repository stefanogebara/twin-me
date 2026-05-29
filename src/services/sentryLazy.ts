/**
 * Lazy Sentry loader (audit-2026-05-29 load-perf).
 *
 * `@sentry/react` + browserTracing + replay (rrweb) used to load eagerly and
 * `Sentry.init()` ran synchronously before `createRoot` in main.tsx — adding
 * hundreds of ms of render-blocking parse/exec to every page load (and a second
 * rrweb on top of PostHog's). This module makes Sentry fully dynamic: main.tsx
 * kicks off init at idle, and errorService.captureError lazy-loads it on demand.
 * Uncaught errors thrown before Sentry is ready are buffered by
 * installEarlyErrorBuffer() and flushed once it loads.
 */
type SentryModule = typeof import('@sentry/react');

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let loadPromise: Promise<SentryModule | null> | null = null;
const earlyErrors: unknown[] = [];
let bufferInstalled = false;
let onError: ((e: ErrorEvent) => void) | null = null;
let onRejection: ((e: PromiseRejectionEvent) => void) | null = null;

function detachBuffer(): void {
  if (onError) window.removeEventListener('error', onError);
  if (onRejection) window.removeEventListener('unhandledrejection', onRejection);
  onError = null;
  onRejection = null;
}

function flushEarlyErrors(S: SentryModule): void {
  detachBuffer();
  for (const err of earlyErrors.splice(0)) {
    try {
      if (err instanceof Error) S.captureException(err);
      else S.captureMessage(typeof err === 'string' ? err : 'Unknown early error', 'error');
    } catch {
      /* never let error reporting throw */
    }
  }
}

/**
 * Dynamically import @sentry/react and run Sentry.init() exactly once. Resolves
 * null when no DSN is configured or the import fails (Sentry is best-effort and
 * must never block or crash the app).
 */
export function loadSentry(): Promise<SentryModule | null> {
  if (!dsn) return Promise.resolve(null);
  if (loadPromise) return loadPromise;
  loadPromise = import('@sentry/react')
    .then((S) => {
      S.init({
        dsn,
        environment: import.meta.env.MODE || 'development',
        integrations: [
          S.browserTracingIntegration(),
          S.replayIntegration({ maskAllText: true, blockAllMedia: true }),
        ],
        // Performance Monitoring
        tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
        // Session Replay
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      });
      flushEarlyErrors(S);
      return S;
    })
    .catch(() => null);
  return loadPromise;
}

/**
 * Install tiny native handlers that buffer errors thrown before Sentry has
 * loaded. Call once, synchronously, at app boot; flushed by loadSentry().
 */
export function installEarlyErrorBuffer(): void {
  if (!dsn || bufferInstalled || typeof window === 'undefined') return;
  bufferInstalled = true;
  onError = (e: ErrorEvent) => { earlyErrors.push(e.error ?? e.message); };
  onRejection = (e: PromiseRejectionEvent) => { earlyErrors.push(e.reason); };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
}

export interface CaptureScope {
  category?: string;
  url?: string;
  context?: Record<string, unknown>;
  /** Message used for captureMessage when `error` isn't an Error instance. */
  message?: string;
}

/**
 * Fire-and-forget error capture. Lazy-loads + inits Sentry on first use, so it
 * works even before the idle init runs. No-op without a DSN.
 */
export function captureError(error: unknown, scope?: CaptureScope): void {
  if (!dsn) return;
  void loadSentry().then((S) => {
    if (!S) return;
    S.withScope((s) => {
      if (scope?.category) s.setTag('category', scope.category);
      if (scope?.url) s.setExtra('url', scope.url);
      if (scope?.context) s.setExtras(scope.context);
      if (error instanceof Error) S.captureException(error);
      else S.captureMessage(scope?.message ?? (typeof error === 'string' ? error : 'error'), 'error');
    });
  });
}
