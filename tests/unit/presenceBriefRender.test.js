import { describe, expect, it } from 'vitest';
import { renderCallBrief } from '../../api/services/presenceBriefRender.js';

const presence = { id: 'p1', cared_for_name: 'Sofia', caller_name: 'Ana', tone: 'Gentle teasing' };

describe('renderCallBrief', () => {
  it('pins identity, disclosure, first-person and language rules with no data at all', () => {
    const { prompt, firstMessage } = renderCallBrief({ presence });
    expect(prompt).toMatch(/AI presence of Ana/);
    expect(prompt).toMatch(/first person/i);
    expect(prompt).toMatch(/NEVER refer to yourself in the third person/);
    expect(prompt).toMatch(/Brazilian Portuguese/);
    expect(prompt).toMatch(/NEVER promise visits, discuss money, give medical advice/);
    expect(firstMessage).toContain('Sofia');
    expect(firstMessage).toContain('Ana');
    // No sections that would imply knowledge we do not have
    expect(prompt).not.toMatch(/FAMILY MAP/);
    expect(prompt).not.toMatch(/NOTES FROM THE FAMILY/);
  });

  it('renders the family map with the name she uses and the deceased rule', () => {
    const { prompt } = renderCallBrief({
      presence,
      people: [
        { name: 'Ana', relation: 'granddaughter', called_by: 'Aninha' },
        { name: 'Jorge', relation: 'husband (deceased)', called_by: '' },
      ],
    });
    expect(prompt).toMatch(/FAMILY MAP/);
    expect(prompt).toContain('Ana (granddaughter) — she calls them "Aninha"');
    expect(prompt).toContain('Jorge (husband (deceased))');
    expect(prompt).toMatch(/"\(deceased\)" has passed away: speak of them only in the past tense/);
    expect(prompt).toMatch(/ask who they are with warm curiosity — never guess/);
  });

  it('delivers family notes as coming from their author, never as its own words', () => {
    const { prompt } = renderCallBrief({ presence, notes: [{ id: 'n1', body: 'Diga que a Ana visita domingo.' }] });
    expect(prompt).toMatch(/NOTES FROM THE FAMILY/);
    expect(prompt).toContain('Diga que a Ana visita domingo.');
    expect(prompt).toMatch(/clearly as coming from Ana/);
    expect(prompt).toMatch(/never rewritten, never presented as your own words/);
  });

  it('separates anchors, boundaries, learned biography, asks and the family introduction', () => {
    const { prompt } = renderCallBrief({
      presence,
      facts: [
        { kind: 'anchor', question: 'A place that matters', answer: 'Ubatuba beach house', confidence: 'committed' },
        { kind: 'boundary', question: 'From the family', answer: 'Never mention selling the beach house', confidence: 'committed' },
        { kind: 'biography', question: 'rotina', answer: 'reza o terço antes de dormir', confidence: 'provisional' },
        { kind: 'biography', question: 'Who is "tia Rê"? She mentioned them in conversation.', answer: 'Awaiting the family', confidence: 'ask' },
        { kind: 'biography', question: 'Family introduction', answer: 'Sofia mora sozinha em Santos.', confidence: 'committed' },
      ],
    });
    expect(prompt).toMatch(/STORY ANCHORS[\s\S]*Ubatuba beach house/);
    expect(prompt).toMatch(/FAMILY-SET BOUNDARIES[\s\S]*Never mention selling the beach house/);
    expect(prompt).toMatch(/THINGS YOU HAVE LEARNED ABOUT SOFIA[\s\S]*reza o terço/);
    // Asks are questions for the family, never facts the agent should assert.
    expect(prompt).not.toContain('Awaiting the family');
    expect(prompt).toMatch(/IN THEIR OWN WORDS[\s\S]*Sofia mora sozinha em Santos/);
  });

  it('carries episodic memory from recent summaries', () => {
    const { prompt } = renderCallBrief({ presence, recentConversations: [{ started_at: 'x', summary: 'She told the seashells story from Ubatuba.' }] });
    expect(prompt).toMatch(/WHAT YOU REMEMBER FROM RECENT CONVERSATIONS[\s\S]*seashells/);
  });

  it('falls back gracefully when names are missing', () => {
    const { prompt, firstMessage } = renderCallBrief({ presence: { id: 'p2', cared_for_name: '', caller_name: '', tone: '' } });
    expect(prompt).toMatch(/AI presence of sua família/);
    expect(firstMessage).toMatch(/Oi, ela!/);
  });
});
