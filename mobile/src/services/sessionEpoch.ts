/** Serialize keychain writes and invalidate work started by a previous login. */
let epoch = 0;
let writes: Promise<unknown> = Promise.resolve();
export const currentSessionEpoch = () => epoch;
export const invalidateSession = () => ++epoch;
export function writeSession(expected: number, write: () => Promise<unknown>): Promise<boolean> {
  const next = writes.catch(() => {}).then(async () => {
    if (expected !== epoch) return false;
    await write();
    return expected === epoch;
  });
  writes = next;
  return next;
}
