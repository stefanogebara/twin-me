import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const f = vi.hoisted(() => ({ ingest: vi.fn(), signature: true }));
vi.mock('../../../api/_app/services/money/inbox.js', () => ({
  inboxAddress: vi.fn(), inboxDomain: vi.fn(), isInboxConfigured: () => true,
  verifySvix: () => f.signature, ingestReceivedEmail: (...a) => f.ingest(...a),
  extractReceipt: vi.fn(), receiptToSighting: vi.fn(),
  /* The mail-attachment path (mailAttachments.js) reads these from the same module. */
  fetchReceivedAttachment: vi.fn(), HELD_STATEMENT_KIND: 'statement_mail', listForwardingRequests: vi.fn(async () => []), listHeldStatements: vi.fn(async () => []), inboxSummary: vi.fn(async () => ({})),
}));
import router from '../../../api/_app/routes/money.js';
const app = express(); app.use(express.json()); app.use('/money', router);
beforeEach(() => { f.signature=true; f.ingest.mockReset(); });
it('returns a retryable failure when verified receipt persistence fails, then acknowledges a successful replay', async () => {
  f.ingest.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce({ outcome:'notice_saved' });
  const event={type:'email.received',data:{email_id:'stable-message-id'}};
  const failed=await request(app).post('/money/inbox/resend').send(event);
  expect(failed.status).toBe(503);
  expect(failed.body.success).toBe(false);
  expect(failed.headers['retry-after']).toBe('60');
  const replay=await request(app).post('/money/inbox/resend').send(event);
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual({success:true,data:{outcome:'notice_saved'}});
});
it('rejects an unverified event without processing it', async () => {
  f.signature=false;
  expect((await request(app).post('/money/inbox/resend').send({type:'email.received'})).status).toBe(401);
  expect(f.ingest).not.toHaveBeenCalled();
});
