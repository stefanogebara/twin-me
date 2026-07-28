/**
 * Streaming-chat 'done' resolution (audit 2026-06, High #8).
 *
 * The twin chat streams over SSE; the assistant bubble is created on the first
 * 'chunk' event. When the model returns an empty/whitespace completion (refusal,
 * over-aggressive filter, glitch) NO chunk is ever sent — only a 'done' event.
 * Previously the 'done' handler ignored its message payload, so the turn was
 * silently lost: the user saw their own message, the typing indicator cleared,
 * then nothing.
 *
 * This pure helper decides what the 'done' handler should do when no chunk has
 * rendered the bubble yet (`firstChunk` still true): render the final message
 * from the done payload if present, otherwise surface an error so the turn is
 * never silently dropped.
 */
export type StreamDoneDecision =
  | { kind: 'render'; content: string }
  | { kind: 'error' }
  | { kind: 'noop' };

export function resolveStreamDone(firstChunk: boolean, message: unknown): StreamDoneDecision {
  // A content chunk already created/filled the bubble — nothing to do here.
  if (!firstChunk) return { kind: 'noop' };
  const text = typeof message === 'string' ? message.trim() : '';
  return text ? { kind: 'render', content: text } : { kind: 'error' };
}
