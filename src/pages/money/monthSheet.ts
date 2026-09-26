/**
 * The month as a file, saved by the browser: the server's own export (GET /money/sheet), fetched
 * with the person's token because a plain link would not carry it. Month offers it under its
 * figure and Ask offers it when asked for "an Excel of September" (2026-09-26); one copy.
 */
import { moneyAPI } from '../../services/api/moneyAPI';

export async function saveMonthSheet(month: string): Promise<void> {
  const { blob, filename } = await moneyAPI.monthSheet(month);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
