import { StrictMode } from 'react';
import { createRoot } from "react-dom/client";
import { installEarlyErrorBuffer, loadSentry } from './services/sentryLazy';
import { AuthProvider } from './contexts/AuthContext';
import { initPostHog } from './contexts/AnalyticsContext';
import { cleanupLegacyServiceWorker } from './services/swCleanup';
import App from "./App.tsx";
import "./index.css";

// Evict the legacy cache-first service worker that pinned returning users to an
// old build (deploys never reached them). Fire-and-forget; self-guarded.
void cleanupLegacyServiceWorker();

// Initialize PostHog analytics (only if VITE_POSTHOG_KEY is configured)
initPostHog();

// Sentry is loaded + initialized OFF the initial render path (audit-2026-05-29
// load-perf): it used to import @sentry/react + browserTracing + replay (rrweb)
// eagerly and run Sentry.init() synchronously here, before createRoot — adding
// hundreds of ms of render-blocking parse/exec to every page load. Now we
// buffer any early errors and load + init Sentry at idle (services/sentryLazy.ts).
if (import.meta.env.VITE_SENTRY_DSN) {
  installEarlyErrorBuffer();
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => { void loadSentry(); }, { timeout: 4000 });
  } else {
    window.setTimeout(() => { void loadSentry(); }, 2000);
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);