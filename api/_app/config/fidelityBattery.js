/**
 * Twin Fidelity Battery — v3
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
 *    data + life-story chapters (unchanged since v1, same ids).
 *  - 5 temporal-recall questions (`temporal: true`) about the LAST TWO
 *    WEEKS — rewritten in v3, see below.
 *
 * WHY v3 REPLACED THE v2 TEMPORAL ITEMS
 * -------------------------------------
 * v2 asked how the fortnight FELT: "familiar favorites on repeat" vs
 * "hunting new music", a "packed" calendar vs "bursts". Those turned out to
 * be unscoreable as twin fidelity, because the user's answer and the logs
 * genuinely disagree: they called a calendar "packed - commitments most
 * days" that records 33 events across 8 of 15 days, and reported "many
 * small scattered things" while their commits concentrated in one repo. A
 * twin answering FAITHFULLY FROM THE EVIDENCE scored zero on those items.
 * The battery was measuring the gap between felt experience and logged
 * behaviour, and no amount of retrieval work can close that gap.
 *
 * v3 asks only what the platform data can settle and the person still knows
 * about themselves — counts and bucketed frequencies, no adjectives of
 * mood. Design rules for any future temporal item:
 *   1. CHECKABLE  — the answer exists as a fact in platform data.
 *   2. KNOWABLE   — the user can answer from memory, without looking.
 *   3. BUCKETED   — coarse ranges, so being off by one does not flip it.
 *   4. GENERIC    — options are user-agnostic and stable across waves.
 * A disagreement on such an item is a recall failure, which is what the
 * eval exists to measure.
 *
 * The retired v2 items (recent_listening, recent_schedule, recent_focus,
 * recent_content, recent_rhythm) are NOT reused. Stored v2 waves keep them,
 * so the felt-vs-logged gap stays available for study.
 *
 * Version mechanics: waves are keyed (user, battery_version, wave), so v3
 * waves restart at wave 1 with no self-consistency ceiling until v3 wave 2.
 * Older waves keep rendering — scoring excludes items missing from either
 * answer set rather than zeroing them.
 */

export const BATTERY_VERSION = 3;

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

  // ---- Temporal recall (v3 — categorical, 4 options, `temporal: true`) ----
  // COUNTS, NOT FEELINGS. Each asks something the platform data can settle
  // and the person still knows about themselves, in coarse buckets so being
  // off by one does not flip the answer. Anchored on the four densest
  // sources (Spotify, Gmail, GitHub, Calendar) — Whoop and YouTube are too
  // sparse to adjudicate, so nothing here depends on them. Every text
  // contains "last two weeks": the answering prompt keys on that phrase to
  // switch the twin from trait recall to evidence counting.
  {
    id: 'recent2_music_days',
    type: 'categorical',
    temporal: true,
    text: 'Over the last two weeks, on how many days did you listen to any music at all?',
    options: ['3 days or fewer', '4 to 7 days', '8 to 11 days', '12 days or more'],
  },
  {
    // Deliberately comparative rather than "how many artists were new to
    // you": Spotify logs 49 first-time artists in a fortnight for the eval
    // user, a number no human would ever report, so that item would have
    // smuggled the felt-vs-logged gap straight back in. Rule 2 (KNOWABLE)
    // is a real constraint, not a formality.
    // This item also needs per-platform ACTIVE-DAY COUNTS to answer, which
    // the digest currently does not render — so it is the natural test for
    // re-trialing activitySpread(): if the spread lines win this item, they
    // earn their way into the prompt on measurement.
    id: 'recent2_most_frequent',
    type: 'categorical',
    temporal: true,
    text: 'Over the last two weeks, which of these did you do on the most days?',
    options: ['Listening to music', 'Writing or pushing code', 'Meetings or scheduled events', 'Watching videos'],
  },
  {
    id: 'recent2_calendar_days',
    type: 'categorical',
    temporal: true,
    text: 'Over the last two weeks, on how many days did you have at least one scheduled calendar event?',
    options: ['3 days or fewer', '4 to 7 days', '8 to 11 days', '12 days or more'],
  },
  {
    id: 'recent2_code_days',
    type: 'categorical',
    temporal: true,
    text: 'Over the last two weeks, on how many days did you push code, open a pull request, or commit anything?',
    options: ['None', '1 to 4 days', '5 to 9 days', '10 days or more'],
  },
  {
    id: 'recent2_email_source',
    type: 'categorical',
    temporal: true,
    text: 'Over the last two weeks, which of these sent you the most email?',
    options: ['Automated notifications from tools and services', 'People I work with', 'Newsletters and media', 'Shopping, travel or banking'],
  },
];
