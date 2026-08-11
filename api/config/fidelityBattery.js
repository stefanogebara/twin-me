/**
 * Twin Fidelity Battery — v2
 * ===========================
 * Fixed 25-item battery for the test-retest fidelity eval (R4; Story
 * Chapters Phase 4a; Park et al. 2024 measurement design).
 *
 * The user answers this battery periodically (waves); the twin answers the
 * same battery from its memory; twin accuracy is normalized by the user's
 * own wave-to-wave consistency. Item ids are the longitudinal join key —
 * NEVER rename an id or change an item's meaning within a battery version;
 * make a new version instead.
 *
 * 10 Likert items (1-5, disagree-agree): BFI-10 (Rammstedt & John, 2007) —
 * the short Big Five inventory, chosen because the 1,000-people paper
 * evaluated on Big Five and because 10 items keep a wave under 3 minutes.
 * 15 categorical items (4 options each):
 *  - 10 stable behavior/preference questions predictable from platform
 *    data + life-story chapters (unchanged from v1, same ids).
 *  - 5 temporal-recall questions (v2, `temporal: true`) about the LAST TWO
 *    WEEKS, answerable by the user from memory and by the twin only from
 *    recent platform data. Added because the v1 battery asked nothing
 *    time-anchored, making temporal context features (the spine) invisible
 *    to the eval — see the verdict log in twin-research/fidelity-eval.js.
 *
 * Version mechanics: waves are keyed (user, battery_version, wave), so v2
 * waves restart at wave 1 with no self-consistency ceiling until v2 wave 2.
 * Old v1 waves keep rendering — scoring excludes items missing from either
 * answer set rather than zeroing them.
 */

export const BATTERY_VERSION = 2;

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

  // ---- Temporal recall (v2 — categorical, 4 options, `temporal: true`) ----
  // Ask about the LAST TWO WEEKS specifically. The user answers from
  // memory; the twin can only answer from recent platform data (Spotify,
  // Calendar, GitHub, YouTube, Whoop). Options are behavior MODES, stable
  // across users and waves — never per-user generated content.
  {
    id: 'recent_listening',
    type: 'categorical',
    temporal: true,
    text: 'Over the last two weeks, your music listening has mostly been:',
    options: ['Familiar favorites on repeat', 'Hunting new music', 'Background for focus or work', 'Barely listened at all'],
  },
  {
    id: 'recent_schedule',
    type: 'categorical',
    temporal: true,
    text: 'How full has your calendar actually been over the last two weeks?',
    options: ['Packed — commitments most days', 'A few anchor events, otherwise open', 'Nearly empty', 'Bursts — heavy days mixed with empty ones'],
  },
  {
    id: 'recent_focus',
    type: 'categorical',
    temporal: true,
    text: 'Over the last two weeks, your working energy has mostly gone to:',
    options: ['One main project taking nearly everything', 'Two or three things in rotation', 'Many small scattered things', 'A lighter stretch than usual'],
  },
  {
    id: 'recent_content',
    type: 'categorical',
    temporal: true,
    text: 'The videos and content you consumed over the last two weeks were mostly:',
    options: ['Learning — tutorials, talks, deep dives', 'Entertainment and unwinding', 'News and staying current', 'Hardly watched anything'],
  },
  {
    id: 'recent_rhythm',
    type: 'categorical',
    temporal: true,
    text: 'Your sleep and energy over the last two weeks have been:',
    options: ['Steady and solid', 'Running on too little', 'Up and down', 'Better than the stretch before'],
  },
];
