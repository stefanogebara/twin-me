import { describe, expect, it } from 'vitest';
import { renderCallBrief } from '../../api/services/presenceBriefRender.js';

/**
 * Conversation-craft rules, written from the real call on 2026-09-01 where the agent
 * connected a kebab to her late mother's kibbeh AND asked a follow-up in the same
 * turn, then prompted her twice in ~20 seconds when she went quiet.
 */

const presence = { id: 'p1', cared_for_name: 'Sofia', caller_name: 'Ana', tone: 'Gentle teasing' };

describe('renderCallBrief — conversation craft', () => {
  const { prompt } = renderCallBrief({ presence });

  it('tells the agent to offer a memory and stop, never memory-plus-question', () => {
    expect(prompt).toMatch(/OFFER the connection and then STOP/);
    expect(prompt).toMatch(/Do not attach a question to it/);
    // Carries the concrete wrong/right pair — few-shot beats abstract instruction.
    expect(prompt).toMatch(/WRONG:[\s\S]*quibe da sua mãe, você lembra\? Quem te ensinou\?/);
    expect(prompt).toMatch(/RIGHT:[\s\S]*then silence/);
  });

  it('forbids turning loss, illness or the dead into questions', () => {
    expect(prompt).toMatch(/people who have died, illness, or loss are especially never turned into questions/);
  });

  it('waits through silence instead of nagging', () => {
    expect(prompt).toMatch(/WHEN SHE GOES QUIET/);
    expect(prompt).toMatch(/Do NOT repeat your question/);
    expect(prompt).toMatch(/não? more than once|not ask "você está aí\?" more than once/);
    expect(prompt).toMatch(/Fico aqui com você/);
  });

  it('treats post-emotional silence as a signal to retreat, not to probe', () => {
    expect(prompt).toMatch(/quiet right after an emotional topic[\s\S]*Never return to it/);
  });

  it('keeps the craft rules even when the presence has no data at all', () => {
    const bare = renderCallBrief({ presence: { id: 'p2', cared_for_name: '', caller_name: '', tone: '' } });
    expect(bare.prompt).toMatch(/OFFER the connection and then STOP/);
    expect(bare.prompt).toMatch(/WHEN SHE GOES QUIET/);
  });
});
