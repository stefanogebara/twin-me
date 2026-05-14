import { useEffect, useState } from 'react';

/**
 * ThinkingIndicator
 * =================
 * Progressive "Thinking..." copy that escalates with elapsed time, so the
 * user knows the system is working rather than stuck. The talk-to-twin
 * live audit (2026-05-13) found cold-start TTFT can hit 10-22s on the
 * first message of a session and 5-15s on tool-routed queries.
 *
 * Stages:
 *   0-4s   "Thinking..."
 *   4-10s  "Pulling your data together..."
 *   10s+   "First message takes a moment — hang tight..."
 *
 * Audit ref: tasks/audit-2026-05-08/talk-to-twin-live-audit/README.md (M1)
 */

const STAGES: Array<{ at: number; label: string }> = [
  { at: 0, label: 'Thinking...' },
  { at: 4000, label: 'Pulling your data together...' },
  { at: 10000, label: 'First message takes a moment — hang tight...' },
];

export function ThinkingIndicator() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    // Schedule each stage transition relative to mount time. Using
    // independent timers so a late re-render doesn't snap forward.
    const timers = STAGES.slice(1).map((stage, idx) =>
      window.setTimeout(() => setStageIndex(idx + 1), stage.at),
    );
    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, []);

  return (
    <div className="flex flex-col items-start py-2" role="status" aria-label="Twin is thinking">
      <div className="flex items-center gap-2.5">
        <div
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: 'var(--accent-vibrant)',
            animation: 'thinking-pulse 1.5s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
        <span
          className="text-[13px] font-medium transition-opacity duration-300"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif' }}
        >
          {STAGES[stageIndex].label}
        </span>
      </div>
      <style>{`
        @keyframes thinking-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
