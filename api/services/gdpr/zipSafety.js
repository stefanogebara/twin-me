/**
 * ZIP safety guards for GDPR import archives (ZIP-bomb + zip-slip protection).
 *
 * Extracted from gdprImportService.js (audit M3 god-file split) AND fixes a live
 * bug: safeAdmZip() called ITSELF on the success path instead of constructing the
 * AdmZip, so every ZIP-based import parser (Discord, WhatsApp, Apple Health,
 * Whoop, Letterboxd, Netflix, TikTok, X, Apple Music, SoundCloud, LinkedIn,
 * Instagram) stack-overflowed.
 */
import AdmZip from 'adm-zip';

const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024; // 200 MB uncompressed cap
const MAX_ZIP_ENTRIES = 50_000;

/**
 * Construct an AdmZip from a buffer with ZIP-bomb guards (compressed size,
 * entry count, total uncompressed size). Throws on violation.
 */
export function safeAdmZip(buffer) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error('safeAdmZip: expected Buffer');
  }
  if (buffer.length > 150 * 1024 * 1024) {
    throw new Error('ZIP too large (>150MB compressed)');
  }
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP has too many entries (${entries.length} > ${MAX_ZIP_ENTRIES})`);
  }
  let totalUnzipped = 0;
  for (const e of entries) {
    totalUnzipped += e.header.size | 0;
    if (totalUnzipped > MAX_UNZIPPED_BYTES) {
      throw new Error(`ZIP uncompressed size exceeds ${MAX_UNZIPPED_BYTES} bytes`);
    }
  }
  return zip;
}

/**
 * Reject unsafe ZIP entry names (zip-slip): traversal, absolute paths, null
 * bytes, Windows drive prefixes.
 */
export function isSafeZipEntryName(name) {
  if (!name || typeof name !== 'string') return false;
  if (/\.\.[\\/]/.test(name)) return false;           // no ../ traversal
  if (/^[\\/]/.test(name)) return false;              // no absolute paths
  if (/\0/.test(name)) return false;                  // no null bytes
  if (/^[a-zA-Z]:[\\/]/.test(name)) return false;     // no windows drive
  return true;
}
