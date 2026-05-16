/**
 * /meetings page — comprehensive quality audit
 * =============================================
 *
 * The page lives at src/pages/MeetingsPage.tsx and reads from
 * GET /api/meeting-briefings — the surface for the Meeting Prep Agent.
 * It buckets briefings into inProgress / upcoming / recent / undated and
 * drives the on-demand scan + recap-email agentic actions.
 *
 * STANDARDS — every assertion below maps to one of these IDs.
 *
 * B — Backend Contract
 *   B-1   GET /meeting-briefings → { success, inProgress[], upcoming[], recent[], undated[], windowDays }
 *   B-2   GET /meeting-briefings → 401 without auth
 *   B-3   POST /meeting-briefings/scan → 401 without auth
 *   B-4   POST /meeting-briefings/:id/recap → 401 without auth; 404 for unknown id with auth
 *
 * F — Page Flow
 *   F-1   Unauthenticated → redirect to /auth
 *   F-2   Authenticated, zero briefings → empty state, no cards
 *   F-3   Authenticated, with upcoming → hero card under "Próxima"
 *   F-4   In-progress meeting → "Acontecendo agora" section, emerald variant, join button
 *   F-5   Recent meeting with debrief → DebriefSection renders, recap button enabled
 *   F-6   Recent meeting, debrief pending → "Debrief a caminho" pill
 *
 * E — Error & Loading
 *   E-1   500 on GET → page renders its own error banner, no ErrorBoundary crash
 *   E-2   Slow GET → loading skeleton appears first
 *   E-3   Page render leaves no unfiltered console.error
 *   E-4   Page render leaves no pageerror
 *
 * U — UI Tokens
 *   U-1   --background = #13121a
 *   U-2   H1 "Meetings" uses Instrument Serif, ≥ 32px
 *   U-3   At least one glass surface with backdrop-filter blur ≥ 16px
 *   U-4   Action pill ("Abrir reunião") border-radius ≥ 100px
 *   U-6   Zero navy surfaces ≥ 80×80px
 *   U-7   Page container max-width 760px
 *
 * X — UX
 *   X-1   Recap button is disabled when the meeting has no debrief
 *   X-2   In-progress join button is an anchor with a real href
 *   X-3   Minimal briefing (no content) renders an honest hint, not a bare card
 *
 * C — CX / Content
 *   C-1   Tagline "Seu twin chega antes de você. Em cada reunião." present
 *   C-2   Empty state shows "Nenhuma reunião por aqui ainda"
 *   C-3   A meeting today shows the "Hoje" relative day label
 *   C-4   "Atualizar" scan button present
 *   C-5   Debrief-pending pill copy mentions the twin is processing
 *
 * Opt-in: TWINME_RUN_MEETINGS_AUDIT=true
 */

import { test, expect, Page, Route } from '@playwright/test';
import { BASE_URL, API_URL, injectAuth, mintTestToken } from './helpers';

test.skip(
  process.env.TWINME_RUN_MEETINGS_AUDIT !== 'true',
  'Meetings audit is heavy. Set TWINME_RUN_MEETINGS_AUDIT=true to opt in.',
);

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers — anchored to "now" so the relative-day labels are deterministic
// regardless of when the suite runs.
// ─────────────────────────────────────────────────────────────────────────────

function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
function minutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — the shaped MeetingBriefing the GET endpoint returns.
// ─────────────────────────────────────────────────────────────────────────────

interface Fixture {
  id: string;
  eventId: string;
  generatedAt: string;
  headline: string;
  summary: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  hangoutLink: string | null;
  meetingUrl: string | null;
  attendees: Array<{ email: string; name: string | null; responseStatus: string | null; organizer: boolean }>;
  hasDebrief: boolean;
  debriefPending: boolean;
  briefing: Record<string, unknown>;
}

const UPCOMING: Fixture = {
  id: 'mb-upcoming-1',
  eventId: 'evt-upcoming-1',
  generatedAt: minutesFromNow(-90),
  headline: 'Sync com a Paula sobre o roadmap do Q3',
  summary: 'Roadmap sync — Paula',
  startTime: todayAt(23),
  endTime: todayAt(23),
  location: null,
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  attendees: [
    { email: 'paula@acme.com', name: 'Paula Reis', responseStatus: 'accepted', organizer: false },
  ],
  hasDebrief: false,
  debriefPending: false,
  briefing: {
    headline: 'Sync com a Paula sobre o roadmap do Q3',
    attendees: [
      { name: 'Paula Reis', company: 'Acme', title: 'Head of Product', whoTheyAre: 'Lidera produto na Acme, foco em retenção.', lastTouchpoint: 'E-mail há 3 dias sobre o orçamento.' },
    ],
    companyContext: 'Acme está fechando o planejamento anual.',
    talkingPoints: ['Confirmar escopo do Q3', 'Alinhar dependências com o time de dados'],
    watchOuts: ['Orçamento ainda não aprovado — não prometer datas'],
    myContext: 'Você liderou a última entrega de dados.',
  },
};

const UPCOMING_2: Fixture = {
  ...UPCOMING,
  id: 'mb-upcoming-2',
  eventId: 'evt-upcoming-2',
  headline: 'Consulta com a Dra. Ana',
  summary: 'Dra. Ana — Academia da Mente',
  startTime: tomorrowAt(10),
  endTime: tomorrowAt(11),
  hangoutLink: null,
  meetingUrl: null,
  attendees: [],
  briefing: {
    headline: 'Consulta com a Dra. Ana',
    attendees: [],
    companyContext: null,
    talkingPoints: ['Entregar as notas online em atraso', 'Perguntar sobre o formato do teste'],
    watchOuts: [],
    myContext: 'Você mencionou estar sobrecarregado na última sessão.',
  },
};

const IN_PROGRESS: Fixture = {
  ...UPCOMING,
  id: 'mb-inprogress-1',
  eventId: 'evt-inprogress-1',
  headline: 'Reunião de design em andamento',
  summary: 'Design review — equipe',
  startTime: minutesFromNow(-20),
  endTime: minutesFromNow(40),
  hangoutLink: 'https://meet.google.com/live-meet-now',
  meetingUrl: 'https://meet.google.com/live-meet-now',
};

const RECENT_WITH_DEBRIEF: Fixture = {
  ...UPCOMING,
  id: 'mb-recent-debrief-1',
  eventId: 'evt-recent-1',
  headline: 'Retro da sprint',
  summary: 'Retro da sprint',
  startTime: minutesFromNow(-300),
  endTime: minutesFromNow(-240),
  hasDebrief: true,
  debriefPending: false,
  briefing: {
    headline: 'Retro da sprint',
    attendees: [],
    talkingPoints: ['O que travou a entrega'],
    watchOuts: [],
    myContext: 'Você facilitou a retro.',
    debrief: {
      summary: 'A equipe alinhou que o gargalo foi a revisão de código.',
      likelyCovered: ['Velocidade da sprint', 'Gargalo de revisão'],
      probableActionItems: [
        { owner: 'me', task: 'Propor pair-review nas PRs grandes' },
        { owner: 'Paula', task: 'Revisar o backlog de bugs' },
      ],
      followUpsRecommended: ['Marcar follow-up em 2 semanas'],
      relationshipNotes: [{ person: 'Paula', note: 'Ficou sobrecarregada esta sprint.' }],
      generatedAt: minutesFromNow(-200),
    },
  },
};

const RECENT_DEBRIEF_PENDING: Fixture = {
  ...UPCOMING,
  id: 'mb-recent-pending-1',
  eventId: 'evt-recent-2',
  headline: 'Call com fornecedor',
  summary: 'Call com fornecedor',
  startTime: minutesFromNow(-50),
  endTime: minutesFromNow(-10),
  hasDebrief: false,
  debriefPending: true,
};

const MINIMAL: Fixture = {
  ...UPCOMING,
  id: 'mb-minimal-1',
  eventId: 'evt-minimal-1',
  headline: '',
  summary: 'Bloco sem contexto',
  startTime: tomorrowAt(15),
  endTime: tomorrowAt(16),
  hangoutLink: null,
  meetingUrl: null,
  attendees: [],
  hasDebrief: false,
  debriefPending: false,
  briefing: { headline: '' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers (string globs — regex starves Vite dynamic imports).
// ─────────────────────────────────────────────────────────────────────────────

interface MockState {
  inProgress: Fixture[];
  upcoming: Fixture[];
  recent: Fixture[];
  undated: Fixture[];
  delayMs: number;
}

async function mockMeetingsAPI(page: Page, state: Partial<MockState> = {}): Promise<void> {
  const body = {
    success: true,
    inProgress: state.inProgress ?? [],
    upcoming: state.upcoming ?? [],
    recent: state.recent ?? [],
    undated: state.undated ?? [],
    windowDays: 14,
  };
  await page.route('**/api/meeting-briefings', async (route: Route) => {
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function mockMeetingsAPI500(page: Page): Promise<void> {
  await page.route('**/api/meeting-briefings', async (route: Route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'simulated server error' }),
    });
  });
}

function attachQuietConsoleListener(page: Page): { errors: string[]; pageErrors: string[] } {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  const BENIGN = ['PostHog', 'posthog', 'favicon', 'ERR_BLOCKED_BY_CLIENT', 'analytics', '429', 'Too Many Requests'];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN.some((b) => text.includes(b))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => { pageErrors.push(err.message); });
  return { errors, pageErrors };
}

async function extractTokens(page: Page) {
  return await page.evaluate(() => {
    const html = document.documentElement;
    const htmlStyles = getComputedStyle(html);
    const h1 = document.querySelector('h1');
    const h1Styles = h1 ? getComputedStyle(h1) : null;

    let glassCount = 0;
    let navyLeaks = 0;
    const all = document.querySelectorAll('*');
    for (let i = 0; i < Math.min(all.length, 1500); i++) {
      const el = all[i] as HTMLElement;
      const cs = getComputedStyle(el);
      const filter = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || '';
      const blurM = filter.match(/blur\((\d+(?:\.\d+)?)px\)/);
      if (blurM && parseFloat(blurM[1]) >= 16) glassCount++;
      const bg = cs.backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const r = +m[1], g = +m[2], b = +m[3];
        if (b > 100 && b > r * 1.5 && b > g * 1.3 && r < 80) {
          const rect = el.getBoundingClientRect();
          if (rect.width >= 80 && rect.height >= 80) navyLeaks++;
        }
      }
    }
    return {
      cssBackground: htmlStyles.getPropertyValue('--background').trim(),
      h1Text: h1?.textContent?.trim() ?? null,
      h1FontFamily: h1Styles?.fontFamily ?? null,
      h1FontSize: h1Styles?.fontSize ?? null,
      glassCount,
      navyLeaks,
    };
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Backend contract — real API
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/meetings — backend contract', () => {
  test('B-2, B-3, B-4: endpoints return 401 without auth', async ({ request }) => {
    const get = await request.get(`${API_URL}/meeting-briefings`);
    expect(get.status(), 'B-2 GET unauth').toBe(401);

    const scan = await request.post(`${API_URL}/meeting-briefings/scan`, { data: {} });
    expect(scan.status(), 'B-3 POST /scan unauth').toBe(401);

    const recap = await request.post(`${API_URL}/meeting-briefings/some-id/recap`, { data: {} });
    expect(recap.status(), 'B-4 POST /recap unauth').toBe(401);
  });

  test('B-1: authenticated GET returns the bucketed shape', async ({ request }) => {
    const token = mintTestToken();
    const headers = { Authorization: `Bearer ${token}` };

    const res = await request.get(`${API_URL}/meeting-briefings`, { headers });
    expect(res.status(), 'B-1 status').toBe(200);
    const body = await res.json();
    expect(body, 'B-1 success').toHaveProperty('success', true);
    expect(Array.isArray(body.inProgress), 'B-1 inProgress array').toBe(true);
    expect(Array.isArray(body.upcoming), 'B-1 upcoming array').toBe(true);
    expect(Array.isArray(body.recent), 'B-1 recent array').toBe(true);
    expect(Array.isArray(body.undated), 'B-1 undated array').toBe(true);
    expect(body, 'B-1 windowDays').toHaveProperty('windowDays');
  });

  test('B-4: recap on an unknown id returns 404 with auth', async ({ request }) => {
    const token = mintTestToken();
    const headers = { Authorization: `Bearer ${token}` };
    // A well-formed-but-nonexistent UUID — ownership/existence check should 404.
    const res = await request.post(
      `${API_URL}/meeting-briefings/00000000-0000-4000-8000-000000000000/recap`,
      { headers, data: {} },
    );
    expect(res.status(), 'B-4 unknown id 404').toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Authenticated UI — populated state
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/meetings — populated state', () => {
  test('F-3, F-4, F-5, F-6, U-*, X-*, C-*: full render', async ({ page }) => {
    const sink = attachQuietConsoleListener(page);
    await injectAuth(page);
    await mockMeetingsAPI(page, {
      inProgress: [IN_PROGRESS],
      upcoming: [UPCOMING, UPCOMING_2],
      recent: [RECENT_WITH_DEBRIEF, RECENT_DEBRIEF_PENDING],
    });

    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Meetings', level: 1 }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);

    // C-1 tagline, C-4 scan button
    await expect(page.getByText('Seu twin chega antes de você. Em cada reunião.'), 'C-1 tagline').toBeVisible();
    await expect(page.getByRole('button', { name: /Atualizar/i }), 'C-4 scan button').toBeVisible();

    // F-4: in-progress section + emerald variant card
    await expect(page.getByText(/Acontecendo agora/i).first(), 'F-4 in-progress label').toBeVisible();
    const inProgressCard = page.locator('[data-testid="briefing-card"][data-variant="inProgress"]');
    await expect(inProgressCard, 'F-4 in-progress card').toHaveCount(1);

    // X-2: in-progress join button is a real anchor
    const joinBtn = inProgressCard.getByRole('link', { name: /Entrar na reunião/i });
    await expect(joinBtn, 'X-2 join button visible').toBeVisible();
    const joinHref = await joinBtn.getAttribute('href');
    expect(joinHref, 'X-2 join href').toBe(IN_PROGRESS.meetingUrl);

    // F-3: hero card under "Próxima"
    await expect(page.getByText(/^Próxima$/i), 'F-3 Próxima label').toBeVisible();
    const heroCard = page.locator('[data-testid="briefing-card"][data-variant="hero"]');
    await expect(heroCard, 'F-3 hero card').toHaveCount(1);

    // Total card count: 1 inProgress + 2 upcoming + 2 recent
    await expect(page.locator('[data-testid="briefing-card"]'), 'all cards').toHaveCount(5);

    // F-5: recent meeting with debrief — DebriefSection + enabled recap button.
    // Scope to the card that actually carries the debrief — the in-progress
    // and upcoming cards also have a (disabled) recap button.
    await expect(page.getByText(/Depois da reunião — leitura do twin/i), 'F-5 debrief section').toBeVisible();
    const debriefCard = page
      .locator('[data-testid="briefing-card"]')
      .filter({ hasText: 'Depois da reunião' });
    await expect(debriefCard, 'F-5 debrief card found').toHaveCount(1);
    const recapEnabled = debriefCard.getByRole('button', { name: /Recap por e-mail/i });
    await expect(recapEnabled, 'F-5 recap button present').toBeVisible();
    expect(await recapEnabled.isDisabled(), 'F-5 recap enabled w/ debrief').toBe(false);

    // F-6 + C-5: debrief-pending pill
    await expect(page.getByText(/Debrief a caminho/i), 'F-6/C-5 pending pill').toBeVisible();

    // X-1: a recap button somewhere is disabled (the upcoming/no-debrief cards)
    const anyDisabledRecap = page.getByRole('button', { name: /Recap por e-mail/i });
    const disabledStates = await anyDisabledRecap.evaluateAll(
      (btns) => btns.map((b) => (b as HTMLButtonElement).disabled),
    );
    expect(disabledStates.some((d) => d === true), 'X-1 a no-debrief recap is disabled').toBe(true);

    // C-3: a meeting today shows "Hoje"
    await expect(page.getByText(/Hoje ·/i).first(), 'C-3 Hoje label').toBeVisible();

    // U-4: action pill border-radius ≥ 100px ("Abrir reunião")
    const openLink = page.getByRole('link', { name: /Abrir reunião/i }).first();
    await expect(openLink, 'U-4 open link present').toBeVisible();
    const radius = parseFloat(await openLink.evaluate((el) => getComputedStyle(el).borderTopLeftRadius));
    expect(radius, 'U-4 pill ≥ 100px').toBeGreaterThanOrEqual(100);

    // Design tokens
    const tokens = await extractTokens(page);
    expect(tokens.cssBackground, 'U-1 --background').toBe('#13121a');
    expect(tokens.h1Text, 'U-2 h1 text').toBe('Meetings');
    expect(tokens.h1FontFamily, 'U-2 h1 family').toMatch(/Instrument Serif/);
    expect(parseFloat(tokens.h1FontSize || '0'), 'U-2 ≥ 32px').toBeGreaterThanOrEqual(32);
    expect(tokens.glassCount, 'U-3 glass surfaces').toBeGreaterThanOrEqual(3);
    expect(tokens.navyLeaks, 'U-6 zero navy').toBe(0);

    // U-7: container max-width 760px (walk up from h1)
    const maxW = await page.getByRole('heading', { name: 'Meetings', level: 1 }).evaluate((el) => {
      let cur: HTMLElement | null = el as HTMLElement;
      while (cur) {
        const mw = getComputedStyle(cur).maxWidth;
        if (mw && mw !== 'none' && parseFloat(mw) > 0) return parseFloat(mw);
        cur = cur.parentElement;
      }
      return 0;
    });
    expect(maxW, 'U-7 max-width 760').toBe(760);

    expect(sink.errors, 'E-3 console errors').toHaveLength(0);
    expect(sink.pageErrors, 'E-4 page errors').toHaveLength(0);
  });

  test('X-3: a minimal briefing renders an honest hint', async ({ page }) => {
    await injectAuth(page);
    await mockMeetingsAPI(page, { upcoming: [MINIMAL] });
    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Meetings', level: 1 }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    await expect(
      page.getByText(/não encontrou contexto suficiente/i),
      'X-3 minimal hint',
    ).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Empty state
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/meetings — empty state', () => {
  test('F-2, C-2: empty state, no cards', async ({ page }) => {
    const sink = attachQuietConsoleListener(page);
    await injectAuth(page);
    await mockMeetingsAPI(page); // all buckets empty

    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Meetings', level: 1 }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);

    await expect(page.getByText('Nenhuma reunião por aqui ainda'), 'F-2/C-2 empty headline').toBeVisible();
    await expect(page.locator('[data-testid="briefing-card"]'), 'F-2 no cards').toHaveCount(0);

    expect(sink.errors, 'E-3 empty errors').toHaveLength(0);
    expect(sink.pageErrors, 'E-4 empty pageerrors').toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Loading + error handling
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/meetings — loading & errors', () => {
  test('E-2: loading skeleton appears before data', async ({ page }) => {
    await injectAuth(page);
    await mockMeetingsAPI(page, { upcoming: [UPCOMING], delayMs: 1500 });

    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'domcontentloaded' });
    // The skeleton uses .animate-pulse — it should be on screen while the
    // delayed GET is still in flight.
    await expect(page.locator('.animate-pulse').first(), 'E-2 skeleton visible').toBeVisible({ timeout: 3000 });
    // ...and resolve into a real card once the GET returns.
    await expect(page.locator('[data-testid="briefing-card"]').first(), 'E-2 resolves to card').toBeVisible({ timeout: 5000 });
  });

  test('E-1: 500 from GET surfaces an error banner, no ErrorBoundary crash', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => { pageErrors.push(err.message); });

    await injectAuth(page);
    await mockMeetingsAPI500(page);

    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    await page.waitForTimeout(2500);

    const boundaryCaught = await page.getByText('Something went wrong').isVisible().catch(() => false);
    expect(
      boundaryCaught,
      'E-1 ErrorBoundary should NOT catch — MeetingsPage handles its own errors. pageerrors: ' +
        (pageErrors.join(' | ') || '(none)'),
    ).toBe(false);

    await expect(
      page.getByRole('heading', { name: 'Meetings', level: 1 }),
      'E-1 header still rendered',
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByText(/request failed|Falha ao carregar|simulated server error/i).first(),
      'E-1 visible error banner',
    ).toBeVisible({ timeout: 5000 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Unauthenticated
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/meetings — unauthenticated', () => {
  test('F-1: redirects to /auth', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url, 'F-1 not on /meetings').not.toMatch(/\/meetings$/);
    expect(url, 'F-1 lands on /auth').toMatch(/\/auth/);
  });
});
