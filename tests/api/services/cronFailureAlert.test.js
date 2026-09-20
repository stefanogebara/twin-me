/** A cron that logs anything but success reaches Sentry, tagged by job, when a DSN is set; never otherwise, never throwing. */
import { afterEach, describe, expect, it, vi } from 'vitest';
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/node', () => sentry);
vi.mock('../../../api/services/database.js', () => ({ supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) } }));
vi.mock('../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));
import { logCronExecution, reportCronFailure } from '../../../api/services/cronLogger.js';
afterEach(() => { vi.unstubAllEnvs(); sentry.captureMessage.mockClear(); });

describe('a cron failure and Sentry', () => {
  it('is reported with the job as a tag when a DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://x@o.ingest.sentry.io/1');
    await logCronExecution('money-pull', 'error', 1200, { seen: 0 }, 'bank session ended');
    expect(sentry.captureMessage).toHaveBeenCalledWith('cron money-pull error: bank session ended', expect.objectContaining({ level: 'error', tags: { cron: 'money-pull', status: 'error' } }));
  });
  it('is not reported on success, nor without a DSN', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://x@o.ingest.sentry.io/1');
    await logCronExecution('money-pull', 'success', 900, {});
    vi.stubEnv('SENTRY_DSN', '');
    await logCronExecution('money-pull', 'error', 900, {}, 'x');
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(await reportCronFailure('money-pull', 'error')).toBe(false);
  });
});
