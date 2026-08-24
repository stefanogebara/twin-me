/**
 * Systemic follow-up to the silent magic-link outage (2026-08-24).
 *
 * That outage had two root causes, and sendMagicLink was only the first path
 * they happened to surface on:
 *
 *   1. On Vercel serverless the process freezes once the response is sent, so
 *      an un-awaited email promise never runs. Fire-and-forget sends are
 *      never-sends in production.
 *   2. The Resend SDK does NOT throw on API errors — it resolves with
 *      { data, error }. A sender that only try/catches (or that returns the
 *      send promise raw) reports success on a rejected send.
 *
 * These tests pin both properties for EVERY sender in emailService.js, not
 * just the one that broke.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: sendMock };
    }
  },
}));

async function importFreshEmailService() {
  vi.resetModules();
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  vi.stubEnv('CRON_SECRET', 'test_cron_secret');
  return import('../../api/services/emailService.js');
}

/** Minimum viable arguments for each sender — enough to render its template. */
const SENDERS = {
  sendWeeklyDigest: {
    toEmail: 'user@example.com',
    firstName: 'Stefano',
    reflections: ['You listen to jazz when you are stuck.'],
    newMemories: 12,
    userId: 'user-1',
  },
  sendFinancialWeeklyReport: {
    toEmail: 'user@example.com',
    firstName: 'Stefano',
    userId: 'user-1',
    report: {
      txCount: 8,
      totalOutflow: 1234.5,
      topCategories: [{ category: 'food_delivery', total: 400 }],
      topStressPurchases: [{ merchant: 'iFood', amount: 90, date: '2026-08-20', stress_score: 0.8 }],
      weekOverWeek: { outflow_delta_pct: 12 },
      savings: { saved: 200, waited: 2 },
      emotionalSpendRatio: 0.3,
      windowStart: '2026-08-17',
      windowEnd: '2026-08-24',
    },
  },
  sendMagicLink: {
    toEmail: 'user@example.com',
    link: 'https://twinme.me/api/auth/magic-link/verify?token=t',
  },
  sendWelcomeEmail: {
    toEmail: 'user@example.com',
    firstName: 'Stefano',
  },
  sendBetaInvite: {
    toEmail: 'user@example.com',
    firstName: 'Stefano',
    inviteCode: 'TWIN-1234',
  },
  sendPlatformNudge: {
    toEmail: 'user@example.com',
    firstName: 'Stefano',
    userId: 'user-1',
  },
  sendInsightNotification: {
    toEmail: 'user@example.com',
    firstName: 'Stefano',
    userId: 'user-1',
    insights: [{ insight: 'You sleep worse the night after a late deploy.', category: 'pattern', urgency: 'medium' }],
  },
  sendMorningBriefing: {
    toEmail: 'user@example.com',
    firstName: 'Stefano',
    userId: 'user-1',
    briefing: {
      greeting: 'Good morning, Stefano',
      highlight: 'Three meetings today, all before noon.',
      cta: 'Talk to your twin',
      stats: { memoriesLearned: 47, platformsConnected: 1, insightsReady: 3 },
      todayEvents: [{ title: 'Standup', time: '09:00', attendees: ['Ana'] }],
    },
  },
};

const SENDER_NAMES = Object.keys(SENDERS);

describe('every email sender honours the Resend { data, error } contract', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  for (const name of SENDER_NAMES) {
    describe(name, () => {
      it('resolves true when Resend accepts the send', async () => {
        sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });
        const mod = await importFreshEmailService();
        await expect(mod[name](SENDERS[name])).resolves.toBe(true);
        expect(sendMock).toHaveBeenCalledOnce();
      });

      it('resolves false when Resend resolves with an error object (does not throw)', async () => {
        sendMock.mockResolvedValue({
          data: null,
          error: { statusCode: 403, name: 'validation_error', message: 'Domain is not verified' },
        });
        const mod = await importFreshEmailService();
        await expect(mod[name](SENDERS[name])).resolves.toBe(false);
      });

      it('resolves false when the send rejects outright (network failure)', async () => {
        sendMock.mockRejectedValue(new Error('fetch failed'));
        const mod = await importFreshEmailService();
        await expect(mod[name](SENDERS[name])).resolves.toBe(false);
      });
    });
  }

  it('resolves false for every sender when Resend is not configured', async () => {
    vi.resetModules();
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('CRON_SECRET', 'test_cron_secret');
    const mod = await import('../../api/services/emailService.js');
    for (const name of SENDER_NAMES) {
      await expect(mod[name](SENDERS[name]), name).resolves.toBe(false);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fire-and-forget guard.
//
// On Vercel, `sendX(...).catch(...)` after res.json()/res.redirect() is a
// no-op: the runtime freezes the invocation the moment the response flushes.
// Every call site must therefore await the send (or return its promise) so it
// runs inside the request/cron lifetime.
// ---------------------------------------------------------------------------

const API_DIR = path.resolve(__dirname, '../../api');

function walkJs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '_archive') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkJs(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('no email sender is invoked fire-and-forget', () => {
  const callSites = [];

  const files = walkJs(API_DIR).filter(f => !f.endsWith(path.join('services', 'emailService.js')));
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const name of SENDER_NAMES) {
      const pattern = new RegExp(`\\b${name}\\s*\\(`, 'g');
      let match;
      while ((match = pattern.exec(source)) !== null) {
        const lineNumber = source.slice(0, match.index).split('\n').length;
        const line = source.split('\n')[lineNumber - 1];
        // Import statements name the function without calling it in a way we care about.
        if (/^\s*(import|export)\b/.test(line) || /from ['"].*emailService/.test(line)) continue;
        const before = source.slice(Math.max(0, match.index - 40), match.index);
        callSites.push({
          file: path.relative(API_DIR, file),
          line: lineNumber,
          name,
          awaited: /\bawait\s+$/.test(before) || /\breturn\s+$/.test(before),
        });
      }
    }
  }

  it('finds the known call sites (guard is actually scanning something)', () => {
    expect(callSites.length).toBeGreaterThanOrEqual(8);
  });

  it('awaits every send inside the request/cron lifetime', () => {
    const forgotten = callSites
      .filter(c => !c.awaited)
      .map(c => `${c.file}:${c.line} — ${c.name}() is not awaited`);
    expect(forgotten).toEqual([]);
  });
});
