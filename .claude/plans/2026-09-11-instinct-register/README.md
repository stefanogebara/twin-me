# The register: Instinct's app, with Cosmos headings

Decided by Stefano on 2026-09-11: "the spacing, all of it I like, just the heading
which we keep like the Cosmos one we already had." Apply to every page, on main
(money + sign-in) and on design/twinme-cosmos (Presence, Portrait, landing, auth).

Source: app.instinct.co measured signed in (Workspace, Vault, Preferences) on
2026-09-11, at 1512 wide and 402 wide. NOT their login page. The values main's
money-v2.css used came from the login page and are off in four places:
- body 16 (should be 13)
- 16px panels (there are none)
- 48/12 buttons (should be 32/4)
- #ffffff page (should be #fbfaf9)

## Colour

| Token | Value | Use |
|---|---|---|
| page | `#fbfaf9` | every screen's ground |
| ink | `#251f21` | text, the rule on top of every list, primary button fill |
| ink-2 | `#585254` | the one grey line under a title (6.9:1 on page) |
| ink-3 | `#6c6867` | quiet text: empty states, names, timestamps (5.4:1 on page) |
| hairline | `#eae9ea` | between rows |
| field | `#f4efec` | input box fill |
| danger line | `#f5aaae` | danger button border |

- Do NOT use Instinct's quiet grey `#969394` for text. It is 2.9:1 and fails AA; use it only for disabled or decorative marks.
- State text colour must reach 4.5:1 on white or page. Instinct's green `#73a89a` (about 2.6:1) and red `#ed313e` (about 3.9:1) fail as 13px text:
  - Use them as borders or icons only.
  - For text, darken until it passes, and state the ratio you measured in the commit.
- Colour appears only in brand icons (32px squares, 8px corners) and in state. No gradients, glass or shadows on app screens.

## Type

Everything is Geist, already loaded.
- If a stylesheet or `index.html` loads Geist as fixed weights (300;400;500;...), change it to the variable range (`wght@100..900`) so weight 350 renders.
- If the font can't be changed where you are working, use 400 wherever this spec says 350.

| Role | Size / line | Weight | Colour |
|---|---|---|---|
| Row title | 13 / 20 | 500 | ink |
| Grey line under a title | 13 / 19.5 | 350 | ink-2 |
| Quiet (empty states, names) | 13 / 19.5 | 350 | ink-3 |
| Prose, only where a paragraph is unavoidable | 13 / 19.5 | 400 | ink |
| Button text | 13 | 400 (primary 500 allowed) | per button |

- Letter-spacing −0.176px on 13px text.
- Numbers use tabular figures.
- No uppercase tracked labels anywhere. Labels are sentence case, as a row title or a grey line.
- Weight makes the hierarchy, not size.

### Headings stay Cosmos (NOT Instinct's serif)

- **Hero / page title:** Geist 300, line-height 1.0, letter-spacing −0.05em, `text-wrap: balance`.
  - Marketing pages: `clamp(46px, 6.3vw, 74px)`, as `.pc-hero h1` is now.
  - App screens (home, onboarding, settings, portrait, money, chat, setup, sign-in): 32–40px.
- **Section heading:** Geist 400, line-height 1.08, letter-spacing −0.04em, balanced.
  - Marketing pages: `clamp(38px, 5.5vw, 66px)`, as `.pc-h2` is now.
  - App screens: `clamp(28px, 3.2vw, 38px)`, as `.pc-h2--sm` is now.
- The front door (`src/styles/landing.css`, `.ld-v0/.ld-v1/.ld-v2/.ld-q`) uses Instrument Serif. It moves to the Geist Cosmos heading above, at the same sizes.
- Heading to its grey line: 4px. Grey line to the list rule: 24px.

## Layout and spacing

- Content column max 820px.
- Where a screen has navigation, a 200px sidebar of plain text links sits 80px to the left of the column. The current link is underlined; there is no fill.
- Phone (≤ 767px): 24px side gutters, navigation behind a menu button, and every other size unchanged.
- Sections sit 72px apart (56 on phones).
- A section is a heading, one grey line, then a list with a 1px ink rule on top.

### Rows, not cards

On app screens there are no cards, panels, boxes, glass or shadows.
- **Row:** `min-height: 80px`, padding 20px 12px, a hairline at the bottom.
  - Grid columns: `[32px icon] [title + one grey line] [one action]`, gap 16, centred vertically.
  - The action is a chevron (16px, ink-2), a 32px button, or a "…" menu. Never two, and never a button that squeezes the grey line.
- **Sub-row** (an account under a service): padding 12px 12px 12px 50px, about 57 tall.
- **Empty state:** one quiet line, about 30px under the rule.
- **Section action** (add): a 16px "+" icon button at the right end of the heading line.

## Controls

- **Button:** 32 tall, padding 0 16, 4px corners, 13px.
  - Primary: ink fill, page-colour text. One per screen.
  - Secondary: white fill, hairline border, ink text.
  - Danger: white fill, `#f5aaae` border, danger text.
- **The one exception:** the main call to action of a marketing or sign-in page ("Create a Presence", "Continue with Google") is Instinct's own sign-in button: 48 tall, 12px corners, 15px weight 500, ink fill. Everything else on those pages is 32/4.
- **Field:** no border, a warm `#f4efec` box, 44 tall, 4px corners, padding 11px 14px, 13px text.
- **Switch:** a 44×26 pill, ink when on, with a 20px page-colour knob.
- **Targets:** at least 24×24 (WCAG 2.5.8). A 32-tall button already passes.

## Copy

- One grey line per row, about 60 characters at most. Never a paragraph inside a row.
- A whole screen stays under about 150 words; a sign-in under 50.
  - Count with `innerText` of `main`, before and after, and put both numbers in the commit.
- Sentence case. Plain words, as a person would say them: no jargon, no "PRs/commits/HRV".
- Keep meaning; cut repetition, reassurance stacks and second explanations.

## Marketing pages (Presence landing, Cosmos landing, front door)

- Keep the photography and the film: they are the product's identity, and removing them is a separate decision.
- Apply the type, controls, spacing, copy cuts and colour tokens. Glass that is only decoration becomes plain. Glass that keeps text readable on a photo stays, and must still pass AA.

## Must hold

- **Text contrast:** at least 4.5:1, or 3:1 at 24px and above.
  - On design/twinme-cosmos, measure with `scripts/audit-cosmos-ink.mjs` (ALL=1) at 402×874 and 1440×900.
  - `tests/unit/cosmosInkContrast.test.ts` must pass. Update its pinned grounds only when a ground truly changes, and say why in the commit.
- **CI:** `node scripts/ci/check-baselines.mjs` holds, `npx vitest run --exclude '**/*.integration.test.js'` passes, and `npm run build` passes.
- **Style:** match the surrounding code style and comment density; no emojis in UI.
