/**
 * Tests for the SoulOS departments gate in buildTwinSystemPrompt
 * (api/services/twinSystemPromptBuilder.js).
 *
 * product-truth-review 2026-08-09, Phase 0 item 1: the capabilities block was
 * gated on `departmentProposals !== null`, but the context-builder fan-out
 * defaults to `[]` on cache miss/fetch error (twinContextBuilder.js) — so the
 * ~1,300-char "YOUR AI DEPARTMENTS (SoulOS)" advertisement was injected into
 * EVERY prompt for every user, every turn, whether or not they had ever
 * touched SoulOS. The block must only appear when there is actual department
 * activity to talk about (pending proposals).
 */
import { describe, it, expect } from 'vitest';

process.env.NODE_ENV = 'test';

const { buildTwinSystemPrompt } = await import(
  '../../../api/services/twinSystemPromptBuilder.js'
);

// buildTwinSystemPrompt returns Anthropic prompt-caching blocks
// [{type:'text', text}, ...] — join to one string so toContain is meaningful
// (an array toContain would pass negative assertions vacuously).
const buildWith = (departmentProposals) =>
  buildTwinSystemPrompt(
    null, // soulSignature
    null, // platformData
    null, // twinSummary
    null, // proactiveInsights
    null, // userLocation
    null, // coreMemoryBlockText
    departmentProposals,
  )
    .map((block) => block.text)
    .join('\n');

const PROPOSAL = {
  id: 'prop-1',
  department: 'communications',
  proposed_action: JSON.stringify({ toolName: 'gmail_draft' }),
  context_summary: 'Draft a reply to the MASP partnership email',
};

describe('buildTwinSystemPrompt — SoulOS departments gate', () => {
  it('omits the departments block when proposals are an empty array (the fan-out default)', () => {
    const prompt = buildWith([]);
    expect(prompt).not.toContain('YOUR AI DEPARTMENTS');
    expect(prompt).not.toContain('DEPT_SUGGEST');
  });

  it('omits the departments block when proposals are null', () => {
    const prompt = buildWith(null);
    expect(prompt).not.toContain('YOUR AI DEPARTMENTS');
  });

  it('includes capabilities AND pending proposals when proposals exist', () => {
    const prompt = buildWith([PROPOSAL]);
    expect(prompt).toContain('YOUR AI DEPARTMENTS');
    expect(prompt).toContain('PENDING FROM YOUR DEPARTMENTS');
    expect(prompt).toContain('Draft a reply to the MASP partnership email');
  });
});
