/** A successful edit makes every Money read stale, including a recently unmounted page. */
let revision = 0;
export const moneyRevision = () => revision;
export const MONEY_CHANGED = 'twinme:money-changed';
export function moneyChanged<T>(value: T): T {
  revision += 1;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MONEY_CHANGED));
  return value;
}
