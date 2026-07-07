/**
 * Characterization tests for voiceReplyPrompt — the pure core of the M1
 * voice-reply skill (prompt assembly + response parsing + honesty guard).
 *
 * This is where "sounds like me" is won or lost, and it's I/O-free, so it gets
 * pinned directly. voiceReplyService wires the real collaborators around it.
 */
import { describe, it, expect } from 'vitest';
import { buildVoiceReplyPrompt, parseDraftResponse } from '../../../api/services/voiceReplyPrompt.js';

const baseCtx = () => ({
  counterpart: { name: 'Maria' },
  voiceInstructions: 'Write warm but direct. Short sentences. No exclamation marks.',
  stylometrics: { avgSentenceWords: 12, vocabulary: 'plain', formality: 0.3, emoji: 'never', signoff: 'Cheers' },
  register: 'You are informal with Maria — first-name only, no sign-off, dry humor.',
  memories: [{ content: 'User is traveling 12-16 July' }],
  directives: [{ content: 'Be more concise in replies' }],
  thread: {
    subject: 'Lunch next week?',
    messages: [
      { author: 'Maria', text: 'Are you around next week for lunch?' },
    ],
  },
});

describe('buildVoiceReplyPrompt', () => {
  it('carries voice, register, memory, directive, and thread into the prompt', () => {
    const { system, user, messages } = buildVoiceReplyPrompt(baseCtx());
    expect(system).toContain('=== HOW THIS USER WRITES (voice) ===');
    expect(system).toContain('Write warm but direct');
    expect(system).toContain('Stylometrics: avg sentence ~12 words');
    expect(system).toContain('typical sign-off "Cheers"');
    expect(system).toContain('=== HOW THEY WRITE TO MARIA (register) ===');
    expect(system).toContain('informal with Maria');
    expect(system).toContain('- User is traveling 12-16 July');
    expect(system).toContain('- Be more concise in replies');
    expect(user).toContain('Subject: Lunch next week?');
    expect(user).toContain('Maria: Are you around next week for lunch?');
    expect(messages).toEqual([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
  });

  it('asks for the exact JSON return shape', () => {
    const { system } = buildVoiceReplyPrompt(baseCtx());
    expect(system).toContain('"draft"');
    expect(system).toContain('"why"');
    expect(system).toContain('voice|register|memory|directive');
    expect(system).toContain('at most 3');
  });

  it('falls back to a no-history register line when register is absent', () => {
    const ctx = baseCtx();
    ctx.register = null;
    const { system } = buildVoiceReplyPrompt(ctx);
    expect(system).toContain('No prior history with Maria');
    expect(system).not.toContain('informal with Maria');
  });

  it('shows placeholders when memories / directives are empty', () => {
    const { system } = buildVoiceReplyPrompt({ counterpart: { name: 'Sam' }, memories: [], directives: [] });
    expect(system).toContain('(none relevant)');
    expect(system).toContain('(none yet)');
  });

  it('omits the stylometrics line when no profile exists yet', () => {
    const { system } = buildVoiceReplyPrompt({ counterpart: { name: 'Sam' }, stylometrics: null });
    expect(system).not.toContain('Stylometrics:');
  });

  it('uses handle then falls back to "them" for the counterpart name', () => {
    expect(buildVoiceReplyPrompt({ counterpart: { handle: 'sam_k' } }).user).toContain('Thread with sam_k:');
    expect(buildVoiceReplyPrompt({}).user).toContain('Thread with them:');
  });

  it('renders only the last 4 thread messages', () => {
    const ctx = baseCtx();
    ctx.thread.messages = Array.from({ length: 6 }, (_, i) => ({ author: 'Maria', text: `msg ${i}` }));
    const { user } = buildVoiceReplyPrompt(ctx);
    expect(user).not.toContain('msg 1');
    expect(user).toContain('msg 2');
    expect(user).toContain('msg 5');
  });
});

describe('parseDraftResponse', () => {
  it('parses a clean minified JSON response', () => {
    const raw = '{"draft":"Sounds great — Tuesday works.","why":[{"kind":"register","note":"casual, no sign-off"}]}';
    const r = parseDraftResponse(raw, baseCtx());
    expect(r.ok).toBe(true);
    expect(r.draft).toBe('Sounds great — Tuesday works.');
    expect(r.why).toEqual([{ kind: 'register', note: 'casual, no sign-off' }]);
  });

  it('accepts the llmGateway { content } object shape', () => {
    const r = parseDraftResponse({ content: '{"draft":"Hi","why":[]}' }, {});
    expect(r.ok).toBe(true);
    expect(r.draft).toBe('Hi');
  });

  it('extracts JSON wrapped in ```json fences```', () => {
    const raw = 'Sure!\n```json\n{"draft":"On my way.","why":[]}\n```';
    const r = parseDraftResponse(raw, {});
    expect(r.ok).toBe(true);
    expect(r.draft).toBe('On my way.');
  });

  it('extracts JSON that trails leading prose', () => {
    const raw = 'Here is the reply: {"draft":"Yes.","why":[]} hope that helps';
    const r = parseDraftResponse(raw, {});
    expect(r.ok).toBe(true);
    expect(r.draft).toBe('Yes.');
  });

  it('fails cleanly on unparseable output', () => {
    const r = parseDraftResponse('the model just rambled with no json', {});
    expect(r).toEqual({ ok: false, error: 'unparseable', draft: null, why: [] });
  });

  it('fails cleanly on an empty draft', () => {
    const r = parseDraftResponse('{"draft":"   ","why":[]}', {});
    expect(r).toEqual({ ok: false, error: 'empty_draft', draft: null, why: [] });
  });

  describe('honesty guard on "why" chips', () => {
    const raw = '{"draft":"ok","why":[{"kind":"memory","note":"used your trip"},{"kind":"directive","note":"kept it short"}]}';

    it('keeps memory/directive chips when that context was supplied', () => {
      const r = parseDraftResponse(raw, { memories: [{ content: 'x' }], directives: [{ content: 'y' }] });
      expect(r.why.map(w => w.kind)).toEqual(['memory', 'directive']);
    });

    it('drops a memory chip when no memories were in context', () => {
      const r = parseDraftResponse(raw, { memories: [], directives: [{ content: 'y' }] });
      expect(r.why.map(w => w.kind)).toEqual(['directive']);
    });

    it('drops a directive chip when no directives were in context', () => {
      const r = parseDraftResponse(raw, { memories: [{ content: 'x' }], directives: [] });
      expect(r.why.map(w => w.kind)).toEqual(['memory']);
    });
  });

  it('drops unknown-kind chips, caps at 3, and trims long notes', () => {
    const longNote = 'x'.repeat(80);
    const raw = JSON.stringify({
      draft: 'ok',
      why: [
        { kind: 'voice', note: 'a' },
        { kind: 'bogus', note: 'nope' },
        { kind: 'voice', note: 'b' },
        { kind: 'register', note: longNote },
        { kind: 'voice', note: 'd' },
      ],
    });
    const r = parseDraftResponse(raw, {});
    expect(r.why).toHaveLength(3);
    expect(r.why.map(w => w.kind)).toEqual(['voice', 'voice', 'register']);
    expect(r.why[2].note).toHaveLength(60);
  });
});
