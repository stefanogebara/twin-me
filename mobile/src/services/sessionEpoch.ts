/** Serialize keychain writes and invalidate work started by a previous login. */
let epoch = 0;
let writes: Promise<unknown> = Promise.resolve();
export const currentSessionEpoch = () => epoch;
const invalidationListeners = new Set<() => void>();
export const onSessionInvalidated = (listener: () => void) => {
  invalidationListeners.add(listener);
  return () => { invalidationListeners.delete(listener); };
};
export const invalidateSession = () => {
  ++epoch;
  invalidationListeners.forEach(listener => listener());
  return epoch;
};
export function writeSession(expected: number, write: () => Promise<unknown>): Promise<boolean> {
  const next = writes.catch(() => {}).then(async () => {
    if (expected !== epoch) return false;
    await write();
    return expected === epoch;
  });
  writes = next;
  return next;
}
