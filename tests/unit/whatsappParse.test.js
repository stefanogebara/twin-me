import { describe, it, expect } from 'vitest';
import { parseWhatsAppLine } from '../../api/services/gdprImportService.js';

// Audit bug: the date regexes only matched 4-digit-year / 24-hour lines, so a
// US-locale export (2-digit year + 12-hour AM/PM) matched NOTHING and the entire
// WhatsApp import threw "Could not parse any messages". These pin the fix.
describe('parseWhatsAppLine', () => {
  it('parses EU bracketed 24h, 4-digit year', () => {
    const r = parseWhatsAppLine('[15/01/2024, 20:32:45] Stefano: hello there');
    expect(r).toBeTruthy();
    expect(r.sender).toBe('Stefano');
    expect(r.body).toBe('hello there');
    expect(r.ts.getFullYear()).toBe(2024);
    expect(r.ts.getMonth()).toBe(0); // January
    expect(r.ts.getDate()).toBe(15);
    expect(r.ts.getHours()).toBe(20);
  });

  it('parses US bracketed 12h AM/PM + 2-digit year (used to fail the whole import)', () => {
    const r = parseWhatsAppLine('[1/15/24, 8:32:45 PM] Stefano: hi');
    expect(r).toBeTruthy();
    expect(r.ts.getFullYear()).toBe(2024);   // 24 -> 2024
    expect(r.ts.getMonth()).toBe(0);          // MM/DD resolved: 1 = month (Jan)
    expect(r.ts.getDate()).toBe(15);          // 15 = day
    expect(r.ts.getHours()).toBe(20);         // 8 PM -> 20
  });

  it('parses the Android dash format with 12h AM/PM', () => {
    const r = parseWhatsAppLine('1/15/24, 8:32 PM - Ana: oi');
    expect(r).toBeTruthy();
    expect(r.sender).toBe('Ana');
    expect(r.body).toBe('oi');
    expect(r.ts.getHours()).toBe(20);
  });

  it('handles 12 AM (midnight) and 12 PM (noon)', () => {
    expect(parseWhatsAppLine('[1/15/24, 12:00 AM] X: y').ts.getHours()).toBe(0);
    expect(parseWhatsAppLine('[1/15/24, 12:00 PM] X: y').ts.getHours()).toBe(12);
  });

  it('resolves DD/MM vs MM/DD via the >12 heuristic', () => {
    const eu = parseWhatsAppLine('15/01/2024, 09:00 - X: y'); // 15 must be the day
    expect(eu.ts.getDate()).toBe(15);
    expect(eu.ts.getMonth()).toBe(0);
  });

  it('returns null for non-message lines', () => {
    expect(parseWhatsAppLine('Messages and calls are end-to-end encrypted.')).toBeNull();
    expect(parseWhatsAppLine('')).toBeNull();
    expect(parseWhatsAppLine('just some text')).toBeNull();
  });
});
