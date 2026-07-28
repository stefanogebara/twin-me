import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { safeAdmZip, isSafeZipEntryName } from '../../api/services/gdpr/zipSafety.js';

describe('safeAdmZip (regression: used to recurse infinitely)', () => {
  it('returns a usable AdmZip for a valid buffer', () => {
    // Against the old recursive implementation this stack-overflowed; it must now
    // construct the zip and expose its entries.
    const z = new AdmZip();
    z.addFile('a.txt', Buffer.from('hi'));
    const buf = z.toBuffer();
    const zip = safeAdmZip(buf);
    expect(zip.getEntries().length).toBe(1);
    expect(zip.getEntries()[0].entryName).toBe('a.txt');
  });

  it('rejects non-Buffer input', () => {
    expect(() => safeAdmZip('not a buffer')).toThrow(/expected Buffer/);
  });

  it('rejects oversized compressed buffers (>150MB) without allocating', () => {
    const fake = { length: 151 * 1024 * 1024 };
    Object.setPrototypeOf(fake, Uint8Array.prototype); // pass the instanceof guard
    expect(() => safeAdmZip(fake)).toThrow(/too large/);
  });
});

describe('isSafeZipEntryName (zip-slip guard)', () => {
  it('accepts normal nested entry names', () => {
    expect(isSafeZipEntryName('messages/123/messages.json')).toBe(true);
    expect(isSafeZipEntryName('Positions.csv')).toBe(true);
  });

  it('rejects traversal, absolute, null-byte, and drive-prefixed names', () => {
    expect(isSafeZipEntryName('../etc/passwd')).toBe(false);
    expect(isSafeZipEntryName('a/../../b')).toBe(false);
    expect(isSafeZipEntryName('/abs/path')).toBe(false);
    expect(isSafeZipEntryName('a\0b')).toBe(false);
    expect(isSafeZipEntryName('C:\\windows')).toBe(false);
    expect(isSafeZipEntryName('')).toBe(false);
    expect(isSafeZipEntryName(null)).toBe(false);
  });
});
