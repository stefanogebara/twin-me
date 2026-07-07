/**
 * Tests for onboardingWow — the M1 activation moment.
 * Pure thread-selection + voice-read logic, plus the DI orchestration that
 * reuses the voice-reply pipeline (mocked).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { selectReplyableThreads, buildVoiceRead, generateWowDrafts } =
  await import('../../../api/services/onboardingWow.js');

describe('selectReplyableThreads', () => {
  const fromMaria = { id: 't-maria', subject: 'Lunch?', messages: [{ from: 'Maria <maria@x.com>', fromName: 'Maria', text: 'Free for lunch next week?', date: '2026-07-03' }] };

  it('picks a thread whose last message is from someone else', () => {
    const r = selectReplyableThreads([fromMaria], { userEmail: 'me@x.com' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      threadRef: 't-maria',
      counterpart: { name: 'Maria', handle: 'maria@x.com' },
      thread: { subject: 'Lunch?', messages: [{ author: 'Maria', text: 'Free for lunch next week?' }] },
    });
  });

  it('excludes a thread already awaiting THEM (last message is the user, by flag or email)', () => {
    const byFlag = { id: 't1', messages: [{ from: 'maria@x.com', text: 'hi' }, { from: 'me@x.com', text: 'sure', isFromUser: true }] };
    const byEmail = { id: 't2', messages: [{ from: 'Me <me@x.com>', text: 'done' }] };
    expect(selectReplyableThreads([byFlag, byEmail], { userEmail: 'me@x.com' })).toEqual([]);
  });

  it('excludes automated / no-reply senders', () => {
    const bot = { id: 't-bot', messages: [{ from: 'GitHub <notifications@github.com>', text: 'PR merged' }] };
    const noreply = { id: 't-nr', messages: [{ from: 'no-reply@stripe.com', text: 'receipt' }] };
    expect(selectReplyableThreads([bot, noreply], { userEmail: 'me@x.com' })).toEqual([]);
  });

  it('marks the user\'s own messages as "me" in the rendered thread', () => {
    const t = { id: 't', messages: [{ from: 'me@x.com', text: 'you around?', isFromUser: true }, { from: 'Sam <sam@x.com>', text: 'yes!', fromName: 'Sam' }] };
    const [sel] = selectReplyableThreads([t], { userEmail: 'me@x.com' });
    expect(sel.thread.messages).toEqual([{ author: 'me', text: 'you around?' }, { author: 'Sam', text: 'yes!' }]);
  });

  it('sorts newest-first and caps at the limit', () => {
    const old = { id: 'old', messages: [{ from: 'a@x.com', text: 'a', date: '2026-06-01' }] };
    const mid = { id: 'mid', messages: [{ from: 'b@x.com', text: 'b', date: '2026-06-15' }] };
    const recent = { id: 'recent', messages: [{ from: 'c@x.com', text: 'c', date: '2026-07-01' }] };
    const r = selectReplyableThreads([old, recent, mid], { userEmail: 'me@x.com', limit: 2 });
    expect(r.map((x) => x.threadRef)).toEqual(['recent', 'mid']);
  });

  it('handles empty / malformed input', () => {
    expect(selectReplyableThreads(null, {})).toEqual([]);
    expect(selectReplyableThreads([{ id: 'x', messages: [] }], {})).toEqual([]);
  });

  it('derives a name from the email when none is given', () => {
    const t = { id: 't', messages: [{ from: 'maria.silva@acme.com', text: 'hi' }] };
    expect(selectReplyableThreads([t], { userEmail: 'me@x.com' })[0].counterpart.name).toBe('Maria Silva');
  });
});

describe('buildVoiceRead', () => {
  it('is graceful when there is no profile yet', () => {
    expect(buildVoiceRead(null)).toMatch(/still learning your voice/i);
  });

  it('reads a casual, brief, warm, humorous writer', () => {
    const line = buildVoiceRead({ formality_score: 0.3, avg_sentence_length: 10, emotional_expressiveness: 0.7, humor_markers: 0.5 });
    expect(line).toContain('casually');
    expect(line).toContain('short, punchy sentences');
    expect(line).toContain('and warm');
    expect(line).toContain('dry sense of humor');
  });

  it('reads a formal, expansive, matter-of-fact writer without inventing humor', () => {
    const line = buildVoiceRead({ formality_score: 0.85, avg_sentence_length: 26, emotional_expressiveness: 0.2, humor_markers: 0 });
    expect(line).toContain('formally');
    expect(line).toContain('long, flowing sentences');
    expect(line).toContain('matter-of-fact');
    expect(line).not.toContain('humor');
  });

  it('degrades gracefully with only partial signal', () => {
    expect(buildVoiceRead({ formality_score: 0.3 })).toBe('You write casually.');
    expect(buildVoiceRead({})).toContain('natural, consistent voice');
  });
});

const deps = (over = {}) => ({
  getProfile: vi.fn(async () => ({ formality_score: 0.3, avg_sentence_length: 11, emotional_expressiveness: 0.7 })),
  draftReply: vi.fn(async () => ({ ok: true, action: { id: 'act-1', draft_text: 'Sure — Tuesday works.' } })),
  ...over,
});

const inbox = () => ([
  { id: 't1', subject: 'Lunch?', messages: [{ from: 'Maria <maria@x.com>', fromName: 'Maria', text: 'lunch next week?', date: '2026-07-03' }] },
  { id: 't2', subject: 'Invoice', messages: [{ from: 'no-reply@stripe.com', text: 'receipt', date: '2026-07-04' }] }, // automated → skipped
  { id: 't3', subject: 'Re: deck', messages: [{ from: 'Sam <sam@x.com>', fromName: 'Sam', text: 'thoughts?', date: '2026-07-02' }] },
]);

describe('generateWowDrafts', () => {
  it('drafts the replyable threads and returns a voice read', async () => {
    const d = deps();
    const r = await generateWowDrafts({ userId: 'u1', userEmail: 'me@x.com', threads: inbox() }, d);
    expect(r.ok).toBe(true);
    expect(r.voiceRead).toContain('casually');
    expect(r.draftsCreated).toBe(2);          // t1 + t3, not the no-reply t2
    expect(d.draftReply).toHaveBeenCalledTimes(2);
    expect(d.draftReply.mock.calls[0][0]).toMatchObject({ userId: 'u1', channel: 'gmail', counterpart: { handle: 'maria@x.com' } });
  });

  it('keeps the wow alive when a single draft fails', async () => {
    const d = deps({
      draftReply: vi.fn()
        .mockResolvedValueOnce({ ok: false, error: 'model_failed' })
        .mockResolvedValueOnce({ ok: true, action: { id: 'act-2' } }),
    });
    const r = await generateWowDrafts({ userId: 'u1', userEmail: 'me@x.com', threads: inbox() }, d);
    expect(r.draftsCreated).toBe(1);
  });

  it('falls back to the no-profile voice read when the profile is missing', async () => {
    const d = deps({ getProfile: vi.fn(async () => null) });
    const r = await generateWowDrafts({ userId: 'u1', userEmail: 'me@x.com', threads: inbox() }, d);
    expect(r.voiceRead).toMatch(/still learning/i);
    expect(r.draftsCreated).toBe(2); // drafting still works
  });

  it('rejects missing input but still returns a graceful voice read', async () => {
    const r = await generateWowDrafts({ threads: [] }, deps());
    expect(r).toMatchObject({ ok: false, error: 'missing_input', draftsCreated: 0 });
    expect(r.voiceRead).toMatch(/still learning/i);
  });
});
