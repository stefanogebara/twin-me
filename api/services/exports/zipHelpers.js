/**
 * Small helpers for reading adm-zip entries safely.
 */

/**
 * Find first entry whose path matches the predicate. O(n) scan; fine for
 * the modest entry counts in these export zips.
 */
export function findEntry(zip, predicate) {
  const entries = zip.getEntries();
  return entries.find((e) => predicate(e.entryName));
}

export function readEntryUtf8(zip, predicate) {
  const entry = findEntry(zip, predicate);
  if (!entry) return null;
  return zip.readAsText(entry, 'utf8');
}

export function readEntryJson(zip, predicate) {
  const text = readEntryUtf8(zip, predicate);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function listEntriesUnder(zip, prefix) {
  return zip.getEntries().filter((e) => e.entryName.startsWith(prefix) && !e.isDirectory);
}

/**
 * Increment a key in a plain object counter. Safe for sparse inputs.
 */
export function bump(counter, key, by = 1) {
  if (!key) return;
  counter[key] = (counter[key] ?? 0) + by;
}

/**
 * Sort an object {key: count} as a top-N array of {key, count}.
 */
export function topN(counter, n, keyName = 'key') {
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, count]) => ({ [keyName]: k, count }));
}

/**
 * Parse a date safely. Returns Date | null.
 */
export function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}
