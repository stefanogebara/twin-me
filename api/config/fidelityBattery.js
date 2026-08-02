/**
 * Twin Fidelity Battery — v1
 * ===========================
 * Fixed 20-item battery for the test-retest fidelity eval (R4; Story
 * Chapters Phase 4a; Park et al. 2024 measurement design).
 *
 * The user answers this battery periodically (waves); the twin answers the
 * same battery from its memory; twin accuracy is normalized by the user's
 * own wave-to-wave consistency. Item ids are the longitudinal join key —
 * NEVER rename an id or change an item's meaning within a battery version;
 * make a v2 instead.
 *
 * 10 Likert items (1-5, disagree-agree): BFI-10 (Rammstedt & John, 2007) —
 * the short Big Five inventory, chosen because the 1,000-people paper
 * evaluated on Big Five and because 10 items keep a wave under 3 minutes.
 * 10 categorical items: behavior/preference questions predictable from
 * platform data + life-story chapters (4 options each).
 */

export const BATTERY_VERSION = 1;

export const LIKERT_SCALE = { min: 1, max: 5 };

export const FIDELITY_BATTERY = [
  // ---- BFI-10 (Likert 1-5: disagree strongly ... agree strongly) ----
  { id: 'bfi_reserved', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who is reserved.' },
  { id: 'bfi_trusting', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who is generally trusting.' },
  { id: 'bfi_lazy', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who tends to be lazy.' },
  { id: 'bfi_relaxed', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who is relaxed, handles stress well.' },
  { id: 'bfi_few_artistic', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who has few artistic interests.' },
  { id: 'bfi_outgoing', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who is outgoing, sociable.' },
  { id: 'bfi_fault_finding', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who tends to find fault with others.' },
  { id: 'bfi_thorough', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who does a thorough job.' },
  { id: 'bfi_nervous', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who gets nervous easily.' },
  { id: 'bfi_imagination', type: 'likert', scale: LIKERT_SCALE, text: 'I see myself as someone who has an active imagination.' },

  // ---- Behavior / preference items (categorical, 4 options) ----
  {
    id: 'sat_morning',
    type: 'categorical',
    text: 'It is Saturday morning with nothing planned. What actually happens?',
    options: ['Sleep in as long as it lasts', 'Up early, out the door', 'Start on a personal project', 'Slow start, then meet people'],
  },
  {
    id: 'stress_response',
    type: 'categorical',
    text: 'Something genuinely stressful lands on you. Your first real move is to:',
    options: ['Process it alone first', 'Talk it through with someone', 'Do something physical', 'Distract myself until it settles'],
  },
  {
    id: 'decision_style',
    type: 'categorical',
    text: 'For big decisions, what do you actually rely on most?',
    options: ['Gut instinct', 'Careful analysis', 'Talking it out', 'Sleeping on it'],
  },
  {
    id: 'social_battery',
    type: 'categorical',
    text: 'After a long social event, you most need:',
    options: ['Quiet time alone', 'One close person to decompress with', 'More of it — keep going', 'Something to make or do'],
  },
  {
    id: 'planning_style',
    type: 'categorical',
    text: 'A free week off appears. How does it get used?',
    options: ['Planned out in advance', 'A loose sketch, improvised daily', 'Fully spontaneous', 'Mostly rest, no agenda'],
  },
  {
    id: 'music_function',
    type: 'categorical',
    text: 'What is music mostly FOR, for you?',
    options: ['Matching or shifting my mood', 'Background for focus', 'Discovery — always hunting new things', 'Memory — returning to what I love'],
  },
  {
    id: 'risk_appetite',
    type: 'categorical',
    text: 'A promising but uncertain opportunity appears. You typically:',
    options: ['Jump before it closes', 'Investigate, then commit', 'Wait for proof it works', 'Pass — stability wins'],
  },
  {
    id: 'work_motivator',
    type: 'categorical',
    text: 'What actually gets you working hardest?',
    options: ['A problem I cannot put down', 'A deadline closing in', 'People counting on me', 'The finish line in sight'],
  },
  {
    id: 'conflict_style',
    type: 'categorical',
    text: 'Real disagreement with someone you care about. You tend to:',
    options: ['Address it head-on, right away', 'Cool off first, then talk', 'Smooth it over, keep the peace', 'Let it fade on its own'],
  },
  {
    id: 'evening_default',
    type: 'categorical',
    text: 'A default weekday evening, honestly, looks like:',
    options: ['Screens and content', 'A personal project or hobby', 'Out or with other people', 'Early wind-down, early sleep'],
  },
];
