import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { currentSessionEpoch } from '../services/sessionEpoch';

/** Kept-mounted destinations re-read on entry/resume without polling or bank pulls.
 * Readers check isCurrent before publishing: hiding, unmounting or changing owner
 * invalidates their result. afterCurrent queues a fresh read after a completed write.
 */
export function useActiveRead(read: (isCurrent: () => boolean) => Promise<void>, active = true) {
  const runRef = useRef<((afterCurrent?: boolean) => Promise<void>) | null>(null);
  const refresh = useCallback((afterCurrent = false) => runRef.current?.(afterCurrent) ?? Promise.resolve(), []);
  useEffect(() => {
    if (!active) return;
    let live = true;
    let state = AppState.currentState || 'active';
    let pending: Promise<void> | null = null;
    let queued: Promise<void> | null = null;
    const epoch = currentSessionEpoch();
    const isCurrent = () => live && epoch === currentSessionEpoch();
    const run = (afterCurrent = false): Promise<void> => {
      if (!isCurrent() || state !== 'active') return Promise.resolve();
      if (pending) {
        if (!afterCurrent) return pending;
        if (!queued) {
          const after = () => { queued = null; return run(); };
          queued = pending.then(after, after);
        }
        return queued;
      }
      pending = Promise.resolve().then(() => read(isCurrent)).finally(() => { pending = null; });
      return pending;
    };
    runRef.current = run;
    const reportFailure = (error: unknown) => {
      if (isCurrent()) console.warn('[Money] Active view refresh failed', error);
    };
    void run().catch(reportFailure);
    const subscription = AppState.addEventListener('change', next => {
      const previous = state;
      state = next;
      if (next === 'active' && previous !== 'active') void run(true).catch(reportFailure);
    });
    return () => {
      live = false;
      if (runRef.current === run) runRef.current = null;
      subscription.remove();
    };
  }, [active, read]);
  return refresh;
}
