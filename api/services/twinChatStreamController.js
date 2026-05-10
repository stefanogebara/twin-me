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

const DEFAULT_TIMEOUT_MS = 50000;
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
