/**
 * Tests for validateHeartbeatProposal (api/services/departmentService.js).
 *
 * replan-2026-06-10 Track B: the department heartbeat queued gmail_draft
 * proposals addressed to the user themselves (the prompt example literally
 * said to:"user@example.com") and drafted a reply to askjo.ai's bot
 * briefing email — the twin committing the user to work, in his voice, to
 * another AI's notification address. These guards reject machine and
 * self recipients before a proposal ever reaches the inbox.
 */
import { describe, it, expect, vi } from 'vitest';

process.env.NODE_ENV = 'test';

// departmentService pulls in supabase/redis/llm plumbing at module load.
// validateHeartbeatProposal itself is pure — mock the heavy deps away.
vi.mock('../../../api/services/database.js', () => ({ supabaseAdmin: {} }));
vi.mock('../../../api/services/redisClient.js', () => ({
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_EXTRACTION: 'extraction',
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../../api/services/autonomyService.js', () => ({
  queueActionForApproval: vi.fn(),
  getAutonomyBySkillName: vi.fn(),
  AUTONOMY_LEVELS: {},
}));
vi.mock('../../../api/services/departmentBudgetService.js', () => ({
  checkDepartmentBudget: vi.fn(),
}));

const { validateHeartbeatProposal } = await import('../../../api/services/departmentService.js');

const USER_EMAIL = 'stefanogebara@gmail.com';

const draft = (to, overrides = {}) => ({
  toolName: 'gmail_draft',
  params: { to, subject: 'Re: proposal', body: 'On it — notes by Friday.', ...overrides },
});

describe('validateHeartbeatProposal — gmail_draft recipient guards', () => {
  it('accepts a draft to a real external person', () => {
    const result = validateHeartbeatProposal(draft('pedro.alves@acme.com.br'), { userEmail: USER_EMAIL });
    expect(result.ok).toBe(true);
    expect(result.toolName).toBe('gmail_draft');
  });

  it.each([
    'noreply@github.com',
    'no-reply@chess.com',
    'notifications@stripe.com',
    'briefing@askjo.ai', // the observed bot-to-bot offender
  ])('rejects draft to automation sender %s', (to) => {
    const result = validateHeartbeatProposal(draft(to), { userEmail: USER_EMAIL });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('recipient_is_automation');
  });

  it('rejects a draft addressed to the user themselves (case-insensitive)', () => {
    for (const to of [USER_EMAIL, 'StefanoGebara@Gmail.com']) {
      const result = validateHeartbeatProposal(draft(to), { userEmail: USER_EMAIL });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('recipient_is_self');
    }
  });

  it('rejects placeholder recipients from the old prompt example', () => {
    const result = validateHeartbeatProposal(draft('user@example.com'), { userEmail: USER_EMAIL });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('recipient_is_placeholder');
  });

  it('still blocks automation recipients when userEmail is unknown', () => {
    const result = validateHeartbeatProposal(draft('noreply@vendor.com'));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('recipient_is_automation');
  });

  it('skips the self-check when userEmail is unknown (cannot compare)', () => {
    const result = validateHeartbeatProposal(draft('someone@empresa.com.br'));
    expect(result.ok).toBe(true);
  });
});

describe('validateHeartbeatProposal — existing whitelist behavior unchanged', () => {
  it('rejects non-whitelisted tools', () => {
    const result = validateHeartbeatProposal({ toolName: 'gmail_send', params: {} });
    expect(result).toMatchObject({ ok: false, reason: 'tool_not_whitelisted' });
  });

  it('rejects gmail_draft missing required params', () => {
    const result = validateHeartbeatProposal({ toolName: 'gmail_draft', params: { to: 'a@b.com' } });
    expect(result).toMatchObject({ ok: false, reason: 'missing_required_params' });
    expect(result.details.missing).toEqual(['subject', 'body']);
  });

  it('calendar_create is unaffected by recipient guards', () => {
    const result = validateHeartbeatProposal(
      {
        toolName: 'calendar_create',
        params: { summary: 'Deep work', start: '2026-06-11T09:00:00', end: '2026-06-11T10:30:00' },
      },
      { userEmail: USER_EMAIL },
    );
    expect(result.ok).toBe(true);
  });

  it('defaults missing toolName to suggest', () => {
    expect(validateHeartbeatProposal({ params: {} }).ok).toBe(true);
  });
});
