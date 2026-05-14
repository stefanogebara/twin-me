/**
 * Twin Chat Stream Controller
 * ===========================
 * SSE / timeout / heartbeat lifecycle wrapped in a controller object.
 * Returns: timedOut(), clearTimeoutTimer(), clearHeartbeat(), clearAll(),
 * extendTimeout(ms, errorMessage).
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { createLogger } from './logger.js';

const log = createLogger('TwinChatStream');

// audit-2026-05-13 C1: the talk-to-twin live audit found that ~26% of
// tool-routed queries (recovery score, money summary, multilingual wellbeing,
// calendar-write) consistently hit the previous 50s timeout. Stream close
// timestamps clustered at 50.7-50.9s on every failure, confirming this
// hard-coded budget was firing rather than upstream latency causing the
// stream to legitimately end with content.
//
// Express request timeout for /chat/message is 60s (api/server.js:274) and
// Vercel maxDuration is 60s, so 55s leaves a 5s safety margin for a clean
// SSE error event to flush before the platform kills the function. This
// recovers 5 extra seconds for the LLM/tool-call portion of any chat turn.
//
// If 55s still proves too tight, the real fix is to find why specific query
// types take >55s (likely context-build fan-out on certain neuropil routes)
// rather than bumping the budget further — that would require changing
// Express + Vercel maxDuration together and is governed by the project's
// $-cost rule keeping function duration ≤ 60s.
const DEFAULT_TIMEOUT_MS = 55000;
const HEARTBEAT_INTERVAL_MS = 2000;

const DEFAULT_TIMEOUT_BLOCKING_BODY = {
  success: false,
  error: 'Chat response took too long. Please try again.',
};

const DEFAULT_TIMEOUT_STREAM_MESSAGE =
  'Response took too long. Please try again with a shorter message.';

function writeSseEvent(res, payload) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    /* client already gone */
  }
}

function makeTimeoutHandler({ res, isStreaming, userId, chatStartTime, state, errorMessage }) {
  return () => {
    state.timedOut = true;
    const elapsedMs = Date.now() - chatStartTime;
    if (!res.headersSent) {
      log.error('Chat endpoint timed out', { userId, elapsedMs });
      res.status(504).json({ success: false, error: errorMessage || DEFAULT_TIMEOUT_BLOCKING_BODY.error });
    } else if (isStreaming) {
      log.error('Chat endpoint timed out (streaming)', { userId, elapsedMs });
      writeSseEvent(res, { type: 'error', error: errorMessage || DEFAULT_TIMEOUT_STREAM_MESSAGE });
      try { res.end(); } catch { /* gone */ }
    }
  };
}

export function createStreamController({
  res,
  isStreaming,
  userId,
  chatStartTime,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const state = { timedOut: false };

  if (isStreaming) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    writeSseEvent(res, { type: 'preparing' });
  }

  const heartbeatInterval = isStreaming
    ? setInterval(() => writeSseEvent(res, { type: 'thinking' }), HEARTBEAT_INTERVAL_MS)
    : null;

  let timeoutTimer = setTimeout(
    makeTimeoutHandler({ res, isStreaming, userId, chatStartTime, state }),
    timeoutMs,
  );

  return {
    timedOut: () => state.timedOut,
    clearTimeoutTimer: () => { clearTimeout(timeoutTimer); },
    clearHeartbeat: () => { if (heartbeatInterval) clearInterval(heartbeatInterval); },
    clearAll: () => {
      clearTimeout(timeoutTimer);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    },
    extendTimeout: (newMs, errorMessage) => {
      clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(
        makeTimeoutHandler({ res, isStreaming, userId, chatStartTime, state, errorMessage }),
        newMs,
      );
    },
  };
}
