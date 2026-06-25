/**
 * Statement-nag cron — template-first delivery (money strategy follow-up).
 *
 * The monthly nag must deliver OUTSIDE Meta's 24h customer-service window,
 * which only a pre-approved template can do. These tests pin the ladder:
 *   1. Template send succeeds → counted, plain text never attempted.
 *   2. Template fails (not yet registered/approved) → plain-text fallback
 *      still fires, so the nag degrades instead of vanishing.
 *   3. Users with fresh transactions are not nagged at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = 'test-cron-secret';

const templateMock = vi.fn();
const textMock = vi.fn();
vi.mock('../../../api/services/whatsappService.js', () => ({
  sendWhatsAppTemplate: (...a) => templateMock(...a),
  sendWhatsAppMessage: (...a) => textMock(...a),
}));

// DB stub: messaging_channels -> one linked user; user_transactions -> per-test.
let channelRows;
let freshTxRows;
function makeBuilder(table) {
  const builder = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'limit']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve, reject) => {
    const data = table === 'messaging_channels' ? channelRows : freshTxRows;
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  };
  return builder;
}
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: (table) => makeBuilder(table) },
  serverDb: {},
}));

const { default: router } = await import('../../../api/routes/cron-statement-nag.js');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/cron/statement-nag', router);
  return a;
}
const AUTH = { Authorization: 'Bearer test-cron-secret' };

describe('cron-statement-nag template ladder', () => {
  beforeEach(() => {
    templateMock.mockReset();
    textMock.mockReset();
    channelRows = [{ user_id: 'u1', channel_id: '+5511999000000' }];
    freshTxRows = []; // no fresh tx -> user is stale -> gets nagged
  });

  it('rejects without the cron secret', async () => {
    const res = await request(app()).post('/api/cron/statement-nag');
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(templateMock).not.toHaveBeenCalled();
  });

  it('sends the template and skips plain text when the template lands', async () => {
    templateMock.mockResolvedValue({ success: true, messageId: 'tmpl-1' });

    const res = await request(app()).post('/api/cron/statement-nag').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.nagged).toBe(1);
    expect(templateMock).toHaveBeenCalledWith('+5511999000000', 'statement_nag', 'en');
    expect(textMock).not.toHaveBeenCalled();
  });

  it('falls back to plain text when the template send fails', async () => {
    templateMock.mockResolvedValue({ success: false, error: 'template not found' });
    textMock.mockResolvedValue({ success: true, messageId: 'txt-1' });

    const res = await request(app()).post('/api/cron/statement-nag').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.nagged).toBe(1);
    expect(templateMock).toHaveBeenCalledTimes(1);
    expect(textMock).toHaveBeenCalledTimes(1);
    // Wording must never solicit account identifiers (WhatsApp policy).
    expect(textMock.mock.calls[0][1]).not.toMatch(/account number|conta n/i);
  });

  it('does not nag users with fresh transactions', async () => {
    freshTxRows = [{ user_id: 'u1' }]; // fresh tx inside the stale window

    const res = await request(app()).post('/api/cron/statement-nag').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.nagged).toBe(0);
    expect(templateMock).not.toHaveBeenCalled();
    expect(textMock).not.toHaveBeenCalled();
  });
});
