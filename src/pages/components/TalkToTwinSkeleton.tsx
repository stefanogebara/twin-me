/**
 * TalkToTwinSkeleton
 * ==================
 * Renders the chat shell shape (header, message area, composer) immediately
 * while the lazy-loaded TalkToTwin chunk is downloading. Mirrors the
 * geometry of TalkToTwin.tsx + ChatInputArea.tsx so the layout doesn't
 * shift when the real page mounts.
 *
 * Audit ref: tasks/audit-2026-05-08/talk-to-twin-live-audit/README.md (H1).
 * The Playwright mobile audit (390x844) couldn't find textarea#twin-chat-input
 * within 3.5s on first visit because the global Suspense fallback was a
 * centered pulsing flower with no input-shaped placeholder. Mobile users
 * (and audit scripts) now see the composer region from the first paint.
 */

export function TalkToTwinSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading talk to twin"
      className="flex relative overflow-x-hidden"
      style={{ height: 'calc(100dvh - 64px - 80px)', maxHeight: 'calc(100dvh - 64px - 80px)' }}
    >
      <style>{`
        @media (min-width: 1024px) {
          [aria-label="Loading talk to twin"] { height: 100dvh !important; max-height: 100dvh !important; }
        }
      `}</style>

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {/* Header bar */}
        <div className="px-3 sm:px-6 pt-4 pb-2 flex items-center justify-between">
          <div className="h-6 w-28 rounded-md bg-white/[0.06] animate-pulse" />
          <div className="h-6 w-6 rounded-full bg-white/[0.06] animate-pulse" />
        </div>

        {/* Message area placeholder — flex-1 reserves the scroll region */}
        <div className="flex-1" />

        {/* Composer placeholder — matches ChatInputArea geometry */}
        <div className="px-3 sm:px-6 pb-6 pt-2 max-w-3xl mx-auto w-full">
          <div
            className="flex items-center gap-3 rounded-[20px] px-5 py-3 border"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderColor: 'rgba(255,255,255,0.10)',
              backdropFilter: 'blur(42px)',
              WebkitBackdropFilter: 'blur(42px)',
            }}
          >
            <div className="flex-1 h-7 rounded-md bg-white/[0.04] animate-pulse" />
            <div className="w-7 h-7 rounded-full bg-white/[0.10] animate-pulse flex-shrink-0" />
          </div>
        </div>

        <span className="sr-only">Loading talk to twin…</span>
      </div>
    </div>
  );
}
