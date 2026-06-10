# TwinMe Full App Audit — 2026-06-10

**Method:** Live browser walkthrough (mobile 386px + desktop 1440px, real auth as test user, real onboarding run, real twin chat) + 62-agent parallel code audit with adversarial verification of every CRITICAL/HIGH finding (0 refuted).

**Artifacts:** `code-audit-full.json` (52 confirmed CRITICAL/HIGH + 167 medium/low, each with file:line evidence and verification reasoning).

## Verdict in one line

World-class content engine wrapped in an inconsistent, under-finished shell: the AI layer (onboarding interview, weekly synthesis, /you portrait, memory stream) is genuinely impressive, but cross-surface data contradictions, PT-BR/EN mixing, silent failures, and broken buttons undermine trust at almost every step.

## Live-walkthrough findings (observed in the running app)

### Onboarding (ran end-to-end as a real user)
- WORKS: intro -> 3-question interview (quality LLM follow-ups, no emojis) -> archetype reveal ("The Deep-Focus Craftsman", synthesized my actual answers) -> personalized awakening ("rosemary from your focaccia" — real memory callback). The wow moment lands.
- [HIGH] Fresh visitor to /onboarding gets bounced to /auth with "Your session expired. Please sign in again." — first-time users never had a session; reads like a crash.
- [HIGH] Platform-connect step ignores real connection state: user with 9 connected platforms sees every card as unconnected "CONNECT".
- [MEDIUM] Mode-choice screen offers exactly one mode (Text conversation) — a chooser with no choice.
- [MEDIUM] Onboarding shows 8 platforms; landing page advertises 10 (Reddit, Twitch missing).
- [MEDIUM] No "that's not me" correction affordance when the interview premise is wrong (e.g. "years in entertainment").
- [LOW] Platform descriptions truncate at mobile width; nested button-in-button on landing "Start Free"; unlabeled icon button in landing nav.

### Dashboard
- WORKS: weekly synthesis narrative is excellent and data-true (Drake, 40k emails, GitHub streaks). Insights cite real branch names.
- [HIGH] Raw template tag rendered to user: "[celebration] You've created 8 new feature..."
- [HIGH] PT-BR meeting card on English dashboard ("PRÓXIMA REUNIÃO · EM 14H", "Ver prep completo").
- [MEDIUM] Duplicated greeting inside one insight: "Good morning, Stefano. Morning Stefano. ..."
- [MEDIUM] Three pending counts visible at once (nav badge 6, AI team "7 pending", INBOX card 1).

### Talk to Twin (core)
- WORKS: response quality high — real recovery number, honest tone, behavioral callback, no emojis; memory write-back confirmed (exchange appeared in /brain 13m later with stylometric annotations).
- [HIGH] Header contradiction: "5 platforms connected. Ask me anything" directly above "5 platforms need reconnection ->" (DB has 9-10 connections).
- [HIGH] Cross-surface knowledge contradiction: dashboard insight cites exact late-night track + time ("'National Treasures' at 10:29 PM"); twin chat says "I don't have your late-night listening data — that's a blind spot." Same data, opposite claims.
- [LOW] Two of three suggestion pills are near-duplicates (both email).

### /you (identity) — strongest page
- WORKS: THEN/NOW evolution, expert observations, values with evidence (5926 GitHub contributions), rhythms, taste, soul score.
- [HIGH] Recovery contradiction with chat on the same morning: chat says 39% today; page says "74% recovery score" NOW-state.
- [MEDIUM] Same-page contradiction: dramatic THEN/NOW transformation vs "WHAT'S CHANGING: Consistent — patterns stable".
- [MEDIUM] CULTURE and SOCIAL expert cards open with the identical sentence ("You've got this weird split where..."); both deep-dive links point to YouTube.
- [LOW] Stored archetype fact got pronoun-garbled ("the time and silence you need to take your true shape").

### /knowledge -> /wiki
- [HIGH] Dead-end: renders 5 bare domain labels, no content, no empty state, no CTA (llm_wiki flag default-off but nav item ships to everyone).

### /inbox
- WORKS: real, specific proposals with reasons.
- [HIGH] No dedup: four near-identical "unsubscribe email... 40k+ backlog" proposals stacked (14/5/13 senders variants from successive runs).

### /meetings
- [HIGH] Entire page chrome in Portuguese ("Seu twin chega antes de você...", "QUEM ESTÁ NA SALA", "CUIDADOS") around English AI content.
- [HIGH] Relationship intel profiles the OWNER as a stranger ("Stefano Gebara — Likely a developer or tech professional") and cites a betting spam email ("Goleada Milionária") as last-contact signal.

### /money — weakest page
- [CRITICAL] Plaid sandbox data presented as real: brokerage literally named "ins_109508", 2018-expiry NFLX option, matured-2024 T-bill, "+1,234,467%" P&L on cash. No demo labeling.
- [HIGH] "Emotional context" column identical for all 25 rows ("4 meetings") — broken enrichment.
- [HIGH] PT/EN soup + accent-less PT ("Gasto diario", "Nivel de estresse"); duplicate transaction sets with shifted dates.

### /connections (/get-started)
- [HIGH] Same-page status contradiction: Gmail "Needs attention" two cards below "Google Workspace: Connected". 5 platforms flagged needing reconnection while dashboard renders fresh insights from those same platforms (false alarms -> user fatigue).
- [MEDIUM] "Soul Richness 95%" vs /you "SOUL SCORE 88" vs chat "5 platforms"; "5 platforms active(5 need reconnection)" missing space; Strava card has two stacked descriptions.

### /settings
- [HIGH] "Twin Accuracy 37%" shown raw with zero framing — undercuts every other surface claiming deep understanding.
- (Settings list shows no reconnection warnings at all — third different connection-status story.)

### /goals
- WORKS: quality suggestions; Accept mutation works (moved to ACTIVE, 14d left).

### Platform health (observed)
- Zero console errors across the entire session. Only failed requests: benign aborted duplicates (3x /auth/verify per load — redundant verify calls).
- Sidebar FLAT (0px radius) — passes the hard design rule. Body bg/system compliant.

## Code audit (62 agents, adversarially verified)

**9 CRITICAL / 43 HIGH confirmed (0 refuted), 167 medium/low.** Full detail with file:line + verification reasoning in `code-audit-full.json`. Highlights:

- [CRITICAL] Gmail tile in onboarding PlatformStep can NEVER connect — provider id 'gmail' vs backend 'google_gmail' -> guaranteed 404 toast. (PlatformStep.tsx:116)
- [CRITICAL] POST /api/chat/message catch block references try-scoped vars -> the error path itself throws. (twin-chat.js:663)
- [CRITICAL] /identity Insights tab permanently fake: "0 memories, 0 platforms, Connect Spotify" even when connected. (ContextSidebar.tsx:97)
- [CRITICAL] growth_edges vs growthEdges key mismatch -> "Stable signal"/"Consistent" are hardcoded-by-bug, never real. (IdentityPage.tsx:524) — explains the live same-page contradiction on /you.
- [CRITICAL] Settings platform Disconnect ALWAYS fails (DELETE without auth header). (Settings.tsx:287)
- [CRITICAL] Web Browsing insights can never show data (no code path creates a 'web' platform_connections row). (platform-insights.js:800)
- [CRITICAL] Wiki related-memories panel always 404s (double /api prefix). (WikiNodeDetailPanel.tsx:113)
- [CRITICAL] /money mixed-currency totals are raw cross-currency sums under one symbol; tooltip claims conversion. (MoneyPage.tsx:226)
- [CRITICAL] Deepening phase renders an empty screen with no forward CTA when questions are missing (deterministic on skip-enrichment path). (DeepeningPhase.tsx:69)
- [HIGH x43] incl.: onboarding re-gate loop (new-user-check ignores platform_connections); hardcoded fake "Awakening" status cards; navy-blue gradients in chat sidebar (forbidden); emoji chronotype icons (no-emoji rule); silent failures on goal mutations, privacy saves (success toast BEFORE save), upgrade button; pricing pages contradict each other and backend limits; annual billing advertised with no annual checkout; plan state hardcoded to Free; waitlist CTA white-on-white invisible; reconnect deep-link param nobody handles; insights "Connect X" shown to connected users on backend errors.

## Systemic themes (the real diagnosis)

1. **No single source of truth for platform/connection state** — every surface computes its own count/status (5 vs 9 vs 10; "Needs attention" vs "Connected" vs nothing). Fix once, centrally (usePlatformsSummary everywhere + one status semantics).
2. **Cross-surface knowledge inconsistency** — dashboard insights, twin chat, and /you each generate from different snapshots/retrievals with no shared "current state" facts (39% vs 74% recovery; knows-the-track vs blind-spot).
3. **Silent failure as the default error strategy** — mutations and fetches across goals, privacy, settings, money, insights swallow errors or show fake fallbacks; several "success" signals fire before/without the operation succeeding.
4. **Language is not a decision** — PT-BR pages (/meetings, /money) inside an English product, PT cards on English pages, EN strings inside PT pages. Pick a locale strategy (i18n or EN-only) and enforce it.
5. **Generated content ships unvalidated** — template tags ([celebration]), duplicated greetings, near-duplicate proposals, spam-as-signal, sandbox-as-real. The generation layer needs an output lint/dedup pass before render.

## Recommended fix order

1. Trust-breakers visible to every user (1-2 days): [celebration] tag, double greeting, twin-page 5/5 contradiction, Gmail onboarding 404, settings Disconnect auth header, goal/privacy silent failures, waitlist invisible CTA.
2. State unification (2-3 days): one platform-status service consumed by chat header, /connections, /settings, onboarding connect step; one recovery/current-stats source injected into insights + chat + /you.
3. Language decision (product call, then 1 day): EN-only now (wrap PT pages) or proper i18n.
4. Money page quarantine (1 day): label sandbox data or hide brokerage section until real data; fix currency math; fix all-rows-"4 meetings".
5. Content-quality gate (2 days): dedup pending proposals semantically; strip template markers; spam filter for relationship signals; emoji strip on all LLM output paths.
6. The 167 medium/low items as a background polish queue (see JSON).
