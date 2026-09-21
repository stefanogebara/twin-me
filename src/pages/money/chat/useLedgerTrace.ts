/**
 * The ledger's work as it happens, read from the stream: each step with its count, and
 * whether a read is in progress. (Split from MoneyChatPage on 2026-09-19, M2-2b.)
 */
import { useEffect, useState } from 'react';
import { authFetch } from '../../../services/api/apiBase';

export type TraceStep = { step: string; label: string; detail: string | null; count: number | null; done: boolean; say?: { key: string; vars?: Record<string, string | number> } | null };

/**
 * The live read of the ledger, over server-sent events. The endpoint is optional by
 * design: if it 404s, errors, or the browser has no EventSource, this returns nothing and
 * the caller shows a quiet line. Nothing here can block or break the conversation.
 */
export function useLedgerTrace(): { steps: TraceStep[]; reading: boolean } {
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    /* Not EventSource: it cannot carry an Authorization header, and this app keeps its
       access token in memory rather than in a cookie the API reads, so the stream came
       back 401. A streaming fetch can send the header, and it also avoids the other way
       out of this, which would have been putting a token in a URL where it lands in logs. */
    const controller = new AbortController();
    let cancelled = false;

    const read = async () => {
      let response: Response;
      try {
        response = await authFetch('/money/stream', {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });
      } catch { return; }
      if (!response.ok || !response.body) return;
      setReading(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          buffer += decoder.decode(value, { stream: true });
          /* Server-sent events are separated by a blank line; anything after the last one
             is a partial frame and waits for the next chunk. */
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            let parsed: unknown;
            try { parsed = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (!parsed || typeof parsed !== 'object') continue;
            const raw = parsed as Record<string, unknown>;
            if (typeof raw.step !== 'string' || !raw.step) continue;
            const next: TraceStep = {
              step: raw.step,
              label: typeof raw.label === 'string' && raw.label ? raw.label : raw.step,
              detail: typeof raw.detail === 'string' && raw.detail ? raw.detail : null,
              count: typeof raw.count === 'number' && Number.isFinite(raw.count) ? raw.count : null,
              done: raw.done === true || raw.state === 'done' || raw.state === 'failed',
              /* The server's own key for the grey line, so the panel speaks the reader's language;
                 dropped here since 2026-09-16, the panel showed the English detail (2026-09-21). */
              say: raw.say && typeof raw.say === 'object' && typeof (raw.say as { key?: unknown }).key === 'string'
                ? { key: (raw.say as { key: string }).key, vars: (raw.say as { vars?: Record<string, string | number> }).vars }
                : null,
            };
            setSteps((all) => {
              const at = all.findIndex((x) => x.step === next.step);
              if (at < 0) return [...all, next];
              const copy = all.slice();
              copy[at] = next;
              return copy;
            });
          }
        }
      } catch {
        /* A dropped connection leaves what already arrived on screen: it did happen. */
      } finally {
        if (!cancelled) setReading(false);
      }
    };

    void read();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  return { steps, reading };
}
