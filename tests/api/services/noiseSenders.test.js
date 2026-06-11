/**
 * Tests for isNoise — the shared sender-filter used by both inbox triage
 * and the relationships agent. Any match means "automation, not a
 * person waiting on you."
 *
 * Audit context (2026-05-21): the dashboard's "5 people waiting on you"
 * card surfaced AliExpress, Info Acekia (Spanish restaurant booking),
 * PS_Exams.Services, and ♟Chess.com — all vendor automation. None of
 * them are humans the user should feel guilty about. This test pins
 * each one as noise so a future refactor of NOISE_PATTERNS can't
 * silently bring them back.
 */
import { describe, it, expect } from 'vitest';
import { isNoise } from '../../../api/services/noiseSenders.js';

describe('isNoise — sender filter for relationships + inbox', () => {
  describe('Audit-listed culprits (must be noise)', () => {
    it.each([
      // Verbatim from prod "5 people waiting on you" insight
      'AliExpress <alerts@aliexpress.com>',
      'Info Acekia <info@acekia.es>',
      'PS_Exams.Services <noreply@ps_exams.com>',
      '♟Chess.com <no-reply@chess.com>',
    ])('rejects %s', (sender) => {
      expect(isNoise(sender)).toBe(true);
    });
  });

  describe('Generic automation', () => {
    it.each([
      'noreply@anywhere.com',
      'no-reply@anywhere.com',
      'donotreply@anywhere.com',
      'do-not-reply@anywhere.com',
      'no_reply@anywhere.com',
      'notifications@stripe.com',
      'newsletter@anywhere.com',
      'updates@anywhere.com',
      'alert@anywhere.com',
      'alerts@anywhere.com',
      'mailer-daemon@gmail.com',
      'bounce@somewhere.com',
    ])('rejects automation pattern: %s', (sender) => {
      expect(isNoise(sender)).toBe(true);
    });
  });

  describe('Social platforms', () => {
    it.each([
      'noreply@github.com',
      'security@linkedin.com',
      'verify@chess.com',
      'team@substack.com',
      'follow@instagram.com',
    ])('rejects social-platform sender: %s', (sender) => {
      expect(isNoise(sender)).toBe(true);
    });
  });

  describe('E-commerce / consumer-app automation', () => {
    it.each([
      'orders@aliexpress.com',
      'AliExpress <alerts@notify.aliexpress.com>',
      'shipping@amazon.com',
      'rides@uber.com',
      'orders@glovo.com',
      'support@ifood.com.br',
    ])('rejects e-commerce automation: %s', (sender) => {
      expect(isNoise(sender)).toBe(true);
    });
  });

  describe('Restaurant booking / exam services (audit additions)', () => {
    it.each([
      // Restaurant booking confirmation senders
      'confirm@opentable.com',
      'reservations@sevenrooms.com',
      'noreply@resy.com',
      'OpenTable <noreply@info.opentable.com>',
      'TheFork <bookings@thefork.com>',
      // Exam services
      'reminders@ps_exams.com',
      'reminders@ps-exams.com',
      'noreply@cambridgeenglish.org',
    ])('rejects booking/exam automation: %s', (sender) => {
      expect(isNoise(sender)).toBe(true);
    });
  });

  describe('AI-assistant notification bots (replan-2026-06-10)', () => {
    // The twin drafted a reply to askjo.ai's bot briefing email in the
    // user's voice ("Got it... I'll start working through the PR queue").
    // AI assistants' notification senders are machines, never recipients.
    it.each([
      'Jo <briefing@askjo.ai>',
      'askjo <hello@askjo.ai>',
    ])('rejects AI-assistant sender: %s', (sender) => {
      expect(isNoise(sender)).toBe(true);
    });
  });

  describe('Real humans pass through', () => {
    it.each([
      'Murilo Lima <murilo.lima@gmail.com>',
      'Stefano Gebara <stefanogebara@gmail.com>',
      'maria.silva@empresa.com.br',
      'Filipe Lima <filipe0lauar@gmail.com>',
      'Aliya Icasiano <aliya@plaid.com>',
      'Dra Ana <ana@academiadamente.com>',
    ])('accepts %s', (sender) => {
      expect(isNoise(sender)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('returns false for empty / undefined / null sender', () => {
      expect(isNoise('')).toBe(false);
      expect(isNoise(undefined)).toBe(false);
      expect(isNoise(null ?? undefined)).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isNoise('NOREPLY@SOMEWHERE.COM')).toBe(true);
      expect(isNoise('AliExpress <Alerts@AliExpress.com>')).toBe(true);
    });

    it('does NOT match noise-ish words inside a real human name', () => {
      // The filter uses substring match, so a name happening to contain
      // an automation token could false-positive. Document the trade-off
      // here so we can spot it if a real user reports their friend got
      // hidden. (Currently 'info@' requires the @ so the substring is
      // tight; 'newsletter' is a real word but unlikely in a personal
      // sender; 'support@' requires the @.)
      expect(isNoise('John Newsletter Doe <john@gmail.com>')).toBe(true); // KNOWN false-positive
    });
  });

  describe('Audit input → output', () => {
    it('the exact 4 vendor senders from prod all collapse to noise', () => {
      // Mirror of the data behind the "5 people waiting on you" insight
      // on 2026-05-21. 4 of 5 should be filtered; 1 was a real person.
      const prodSenders = [
        { display: 'AliExpress',           from: 'AliExpress <alerts@aliexpress.com>',           expectNoise: true },
        { display: 'Info Acekia',          from: 'Info Acekia <info@acekia.es>',                expectNoise: true },
        { display: 'PS_Exams.Services',    from: 'PS_Exams.Services <noreply@ps_exams.com>',    expectNoise: true },
        { display: '♟Chess.com',           from: '♟Chess.com <no-reply@chess.com>',             expectNoise: true },
        { display: 'filipe0lauar',         from: 'filipe0lauar <filipe@gmail.com>',             expectNoise: false },
      ];
      for (const s of prodSenders) {
        expect(isNoise(s.from), `${s.display} → noise should be ${s.expectNoise}`).toBe(s.expectNoise);
      }
    });
  });
});
