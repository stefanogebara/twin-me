/**
 * Tests for PROPOSAL_TEXT_RULES (api/services/departmentService.js) — rules 7-8
 * of the department heartbeat prompt.
 *
 * optmem-brain audit, Phase 0 item 2 (root cause 11): the few-shot MANDATED
 * citing a big number and showcased it as the model answer —
 *   GOOD: "Draft a 15-minute Inbox Zero plan to triage 39,723 unread emails"
 * A proposal's description becomes `context_summary`, and getPendingProposals
 * applies NO time filter (`user_response IS NULL` only), so the tile stays
 * pending indefinitely and twinSystemPromptBuilder injects it into every chat
 * with no date attached. The prompt was therefore instructing the model to
 * mint exactly the class of stale figure the audit is chasing — a running
 * total that is wrong within hours but quoted for weeks.
 *
 * The fix must not be collateral damage to specificity: the anti-vagueness
 * guards ("Consider tackling your email backlog") are load-bearing and are
 * pinned here too.
 */
import { describe, it, expect, vi } from 'vitest';

process.env.NODE_ENV = 'test';

// departmentService pulls in supabase/redis/llm plumbing at module load.
// PROPOSAL_TEXT_RULES is a static string — mock the heavy deps away.
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

const { PROPOSAL_TEXT_RULES } = await import('../../../api/services/departmentService.js');

const lines = PROPOSAL_TEXT_RULES.split('\n').map(l => l.trim());
const goodExamples = lines.filter(l => l.startsWith('GOOD:'));
const badExamples = lines.filter(l => l.startsWith('BAD:'));

/**
 * A "running total" figure: comma-grouped (39,723), four-plus digits (40443),
 * or k-suffixed (39k). Small numbers (42%, 90 minutes, 12 emails) are fine —
 * those are deltas and durations, not accumulated state.
 */
const RUNNING_TOTAL = /\d{1,3},\d{3}|\b\d{4,}\b|\b\d+k\b/;

describe('PROPOSAL_TEXT_RULES — no stale-snapshot mandate', () => {
  it('has GOOD and BAD examples to assert on', () => {
    expect(goodExamples.length).toBeGreaterThan(0);
    expect(badExamples.length).toBeGreaterThan(0);
  });

  it('never showcases a running total as a GOOD example', () => {
    // The regression: "39,723 unread emails" and "39,723 unread (92% unread
    // rate)" were both GOOD, i.e. the target the model aims at.
    for (const line of goodExamples) {
      expect(line).not.toMatch(RUNNING_TOTAL);
    }
  });

  it('explicitly forbids running totals / lifetime backlogs', () => {
    expect(PROPOSAL_TEXT_RULES).toMatch(/running total/i);
  });

  it('teaches the anti-pattern by demoting it to a BAD example', () => {
    expect(badExamples.some(l => RUNNING_TOTAL.test(l))).toBe(true);
  });

  it('requires a metric reading to carry its time reference', () => {
    expect(PROPOSAL_TEXT_RULES).toMatch(/time reference/i);
  });

  it('still forbids hedging (specificity guard is not collateral damage)', () => {
    expect(PROPOSAL_TEXT_RULES).toMatch(/NEVER use hedging words/);
    expect(badExamples.some(l => /consider/i.test(l))).toBe(true);
  });

  it('still demands a concrete verb and a length bound', () => {
    expect(PROPOSAL_TEXT_RULES).toMatch(/Start with a concrete verb/);
    expect(PROPOSAL_TEXT_RULES).toMatch(/Be 8-20 words/);
    expect(PROPOSAL_TEXT_RULES).toMatch(/Be 10-25 words/);
  });

  it('still requires the reasoning line to name its source', () => {
    expect(PROPOSAL_TEXT_RULES).toMatch(/Identify the source/);
  });

  it('stays numbered 7 and 8 so the spliced RULES block reads in order', () => {
    expect(PROPOSAL_TEXT_RULES.startsWith('7. ')).toBe(true);
    expect(PROPOSAL_TEXT_RULES).toContain('\n8. ');
  });
});
