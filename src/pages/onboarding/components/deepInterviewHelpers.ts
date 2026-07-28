// Pure helpers for DeepInterview's fetch-error recovery. Kept in a standalone
// module so they can be unit-tested without rendering the component (the project
// does not ship @testing-library/react).

/** Shown when the calibration fetch fails after its retries are exhausted. */
export const FETCH_ERROR_MESSAGE =
  "Something went wrong on my end. Tap Try again below, or 'Done for now' to continue.";

/**
 * The error bubble is not a real interview turn. Strip it before refetching so
 * it never pollutes the conversation history sent to the model on retry. Pure.
 */
export function dropTrailingErrorBubble<T extends { role: string; content: string }>(
  msgs: T[],
): T[] {
  const last = msgs[msgs.length - 1];
  return last && last.role === 'assistant' && last.content === FETCH_ERROR_MESSAGE
    ? msgs.slice(0, -1)
    : msgs;
}
