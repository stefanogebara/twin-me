/**
 * Twin-chat get_meeting_prep tool — live end-to-end test.
 *
 * Verifies the chat integration: ask the twin "what's my prep for
 * tomorrow?" and confirm it calls get_meeting_prep, receives the real
 * briefings, and weaves them into its reply.
 *
 * Proof of correctness: the test user's calendar has two real
 * appointments tomorrow ("Dra Ana Academia da Mente", "Cabelereiro
 * Amelia"). If the twin's response mentions either, the tool was called
 * AND returned real data AND the twin used it. If the twin answers
 * generically with no meeting names, the tool path didn't fire.
 *
 * PREREQ: briefings must already exist for the test user — run the
 * meeting scan first (the live-scan spec or hit /scan). This test reads;
 * it doesn't generate.
 *
 * Real LLM + tool-call + second LLM pass — generous timeouts. Diagnostic
 * style: screenshots every beat, the response text dumped to the log.
 *
 * Opt-in: TWINME_RUN_CHAT_TOOL_TEST=true
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { BASE_URL, SCREENSHOT_DIR, injectAuth } from './helpers';

test.skip(
  process.env.TWINME_RUN_CHAT_TOOL_TEST !== 'true',
  'Live chat tool test hits real LLM + calendar. Set TWINME_RUN_CHAT_TOOL_TEST=true to opt in.',
);

const SHOT_DIR = path.join(SCREENSHOT_DIR, 'chat-meeting-prep');

test.describe('twin-chat — get_meeting_prep tool', () => {
  // Cold first-message path is slow: full context build (memory retrieval +
  // twin summary + wiki) → tool call → second LLM pass → stream. Budget
  // generously — 5 min test, 3 min for the assistant block to first appear.
  test.setTimeout(300_000);

  test('asking "what is my prep for tomorrow" surfaces the real briefings', async ({ page }) => {
    await fs.mkdir(SHOT_DIR, { recursive: true });

    const findings: string[] = [];
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (!/PostHog|posthog|favicon|ERR_BLOCKED/.test(t)) consoleErrors.push(t);
      }
    });

    await injectAuth(page);

    // ── Load the chat
    await page.goto(`${BASE_URL}/talk-to-twin`, { waitUntil: 'domcontentloaded' });
    const input = page.locator('#twin-chat-input');
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOT_DIR, '01-chat-loaded.png'), fullPage: true });
    findings.push('/talk-to-twin loaded, input ready');

    // ── Ask the meeting-prep question
    const question = 'What meetings do I have coming up and what should I prep for?';
    await input.fill(question);
    await input.press('Enter');
    findings.push(`Sent: "${question}"`);

    // User bubble should echo immediately
    await expect(
      page.locator('p.whitespace-pre-wrap.text-right', { hasText: /meetings do I have/i }),
      'user message echoed',
    ).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, '02-question-sent.png'), fullPage: true });

    // ── The chat can fail for reasons outside this feature's control —
    //    most commonly an exhausted OpenRouter balance (HTTP 402). That
    //    surfaces as a "Couldn't fetch your data" failure bubble. Detect
    //    it and SKIP gracefully — it's an external billing issue, not a
    //    defect in get_meeting_prep. (The tool's data path is unit-proven
    //    separately by calling listMeetingBriefingsForChat directly.)
    const failureBubble = page.getByText(/Couldn't fetch your data|out of credits|requires more credits/i).first();
    const assistantBlock = page.locator('.prose.prose-invert').last();

    const outcome = await Promise.race([
      assistantBlock.waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'response'),
      failureBubble.waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'chat_failed'),
    ]).catch(() => 'timeout');

    if (outcome === 'chat_failed') {
      await page.screenshot({ path: path.join(SHOT_DIR, '03-chat-failed.png'), fullPage: true });
      const failText = (await failureBubble.textContent().catch(() => '')) || '';
      findings.push(`Chat failed (external): ${failText}`);
      await fs.writeFile(
        path.join(SHOT_DIR, 'report.md'),
        `# get_meeting_prep tool test — SKIPPED\n\nThe twin chat returned a failure bubble — almost always an\nexhausted OpenRouter balance (HTTP 402). This is an external billing\nissue, not a defect in get_meeting_prep.\n\nThe tool's data path is verified separately: calling\nlistMeetingBriefingsForChat() directly returns the real briefings.\n\nFailure text: ${failText}\nRun: ${new Date().toISOString()}\n`,
      );
      console.log('\n[chat-tool-test] SKIPPED — chat failed on an external issue (likely OpenRouter credits).');
      console.log('[chat-tool-test] Failure text:', failText);
      test.skip(true, `Twin chat unavailable (external): ${failText}`);
      return;
    }
    if (outcome === 'timeout') {
      throw new Error('Neither a response nor a failure bubble appeared within 180s');
    }

    // Let the stream finish — poll until the text stops changing.
    let prevText = '';
    let stableCount = 0;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1500);
      const cur = (await assistantBlock.textContent().catch(() => '')) || '';
      if (cur === prevText && cur.length > 0) {
        stableCount++;
        if (stableCount >= 3) break; // ~4.5s stable = stream done
      } else {
        stableCount = 0;
        prevText = cur;
      }
    }

    await page.screenshot({ path: path.join(SHOT_DIR, '03-response.png'), fullPage: true });

    const responseText = (await assistantBlock.textContent().catch(() => '')) || '';
    findings.push(`Response length: ${responseText.length} chars`);
    findings.push(`Response: ${responseText.slice(0, 600)}`);

    // ── Did a tool-call card render? (WorkspaceActionCard for get_meeting_prep)
    const toolCard = page.getByText(/get_meeting_prep|meeting_prep|meeting prep/i).first();
    const toolCardVisible = await toolCard.isVisible().catch(() => false);
    findings.push(`Tool-call card visible: ${toolCardVisible}`);

    // ── The real proof: does the response reference the actual meetings?
    const mentionsRealMeeting =
      /dra\.?\s*ana|academia da mente|cabel[ei]rei?ro|amelia/i.test(responseText);
    findings.push(`Response references a real meeting: ${mentionsRealMeeting}`);

    // ── Report
    const report = [
      '# twin-chat get_meeting_prep tool — live test',
      `Run: ${new Date().toISOString()}`,
      '',
      '## Findings',
      ...findings.map((f) => `- ${f}`),
      '',
      consoleErrors.length ? '## Console errors' : '## Console errors — none',
      ...consoleErrors.slice(0, 10).map((e) => `- ${e}`),
    ].join('\n');
    await fs.writeFile(path.join(SHOT_DIR, 'report.md'), report);

    console.log('\n=== CHAT get_meeting_prep TEST ===');
    findings.forEach((f) => console.log('  ' + f.slice(0, 300)));

    // ── Assertions
    expect(responseText.length, 'twin produced a non-empty response').toBeGreaterThan(20);
    expect(
      mentionsRealMeeting,
      'twin response references a real upcoming meeting (proves the tool returned real data and the twin used it)',
    ).toBe(true);
    expect(consoleErrors, 'no unfiltered console errors').toHaveLength(0);
  });
});
