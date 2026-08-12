/**
 * Recent-platform-digest injection into the twin system prompt.
 *
 * The digest earned production injection through the fidelity eval
 * (2026-08-11 three-arm trial; twin-research/fidelity-eval.js verdict
 * log). Pinned here:
 *  - the block lands in the dynamic context when present
 *  - it is clamped at 3k chars so it can never truncate the PLATFORM
 *    CONTEXT tail (the exact failure the spine's clamp existed for)
 *  - null/empty digest leaves the prompt without the block
 */
import { describe, it, expect } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { buildTwinSystemPrompt } = await import(
  '../../../api/services/twinSystemPromptBuilder.js'
);

const promptText = (blocks) => blocks.map(b => b.text).join('\n');

const DIGEST = '=== MY LAST TWO WEEKS (platform data, Jul 29 - Aug 12) ===\nSPOTIFY (426 events):\n- [Aug 11] Played X';

describe('buildTwinSystemPrompt — recent platform digest', () => {
  it('injects the digest block into the dynamic context', () => {
    const blocks = buildTwinSystemPrompt(
      null, null, null, null, null, null, null, null, null, DIGEST,
    );
    const text = promptText(blocks);
    expect(text).toContain('=== MY LAST TWO WEEKS');
    expect(text).toContain('SPOTIFY (426 events)');
  });

  it('clamps oversized digests from the tail with a truncation marker', () => {
    const huge = DIGEST + '\n' + '- [Aug 10] filler line about a played track\n'.repeat(200);
    const blocks = buildTwinSystemPrompt(
      null, null, null, null, null, null, null, null, null, huge,
    );
    const text = promptText(blocks);
    expect(text).toContain('[...older platform events truncated]');
    // The injected block (header to marker) stays within the 3k clamp.
    const start = text.indexOf('=== MY LAST TWO WEEKS');
    const end = text.indexOf('[...older platform events truncated]');
    expect(end - start).toBeLessThanOrEqual(3000 + 1);
  });

  it('omits the block entirely when the digest is null or empty', () => {
    for (const digest of [null, '']) {
      const blocks = buildTwinSystemPrompt(
        null, null, null, null, null, null, null, null, null, digest,
      );
      expect(promptText(blocks)).not.toContain('MY LAST TWO WEEKS');
    }
  });
});
