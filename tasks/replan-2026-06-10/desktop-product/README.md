# TwinMe Desktop — Product Plan (2026-06-10)

**Inputs:** 5-track research (Littlebird deep-dive, Ask Jo deep-dive, ambient-AI
landscape 2025-26, capture architecture, internal desktop audit — all in
`research-full.json`, load-bearing claims fact-checked) + today's "so what?"
strategy review (`../README.md`). The verdict that frames everything, from the
internal audit: **"the new product is largely a wiring job between assets that
already exist."**

## 1. Thesis

**From a portrait of you to a chief of staff who watched everything.**

The user looks at Soul Signature / Knowledge / Brain and thinks "nice... so
what?" — because those are EXHIBITION surfaces. The market data agrees:
archive/exhibition products died (Rewind dead, Recall crippled, Dot shut down),
artifact/utility products compounded (Granola $1.5B at 250%/quarter; Jo and
Littlebird both anchor on a daily artifact). The pivot: every gram of the
personality/memory machinery becomes INFRASTRUCTURE powering three utility
surfaces — none of it remains a destination page.

## 2. What we take from each competitor (and what we refuse)

### From Littlebird (littlebird.ai — verified)
TAKE:
- **Text-not-screenshots capture identity** — we already do this (a11y text
  clips, no pixels). Make it the explicit privacy brand: "if you can't see it,
  we can't; we store facts, never screens."
- **Zero-setup instant wow**: works the moment you install; the engineered
  moment is asking "what have I been working on this week?" after 2 days. Our
  onboarding observe-summary IS this — extend it past first-run.
- **Routines**: user-authored scheduled prompts ("every Friday: summarize what
  I shipped") — productized proactivity, later phase.
- **Pre-generated personalized chat starters** that improve over time.
REFUSE:
- **Cloud storage of everything seen** — their #1 user objection (HN
  dealbreaker; spawned an open-source local-first competitor within weeks).
  Our contract: raw text processed to FACTS locally-ish (today: bounded clips;
  target: on-device extraction), pixels never exist, users see + delete.
- Their integration shallowness — our platform depth (Whoop/Spotify/GitHub) is
  a moat they don't have.

### From Ask Jo (askjo.ai — verified from the founder's own inbox)
TAKE (this is the proactivity masterclass):
- **ONE predictable daily interrupt** (~6:30am local) — everything else folds
  into it. No event-driven pinging.
- **The verdict line**: every brief opens with a one-sentence cognitive-load
  judgment ("Busy morning, but contained."). 3-second decision: engage or skim.
- **Time-estimated, ready-to-drag actions** ("Review PR #100 findings — about
  45 min").
- **Active Projects carry-forward**: multi-day threads with dated evidence
  that visibly evolve until resolved — the anti-"one-off insight".
- **Reply-to-act**: the brief arrives from a per-user address
  (stefano@in.twinme.app); replying IS commanding the twin. (Later phase.)
- **Quantified value in lifecycle emails** ("your twin holds 23,155 memories,
  added 412 this week").
- **Depth before breadth**: Jo's quality came from Gmail+Calendar alone.
REFUSE:
- Per-user cloud VM economics at our stage; voice-first framing (they
  abandoned it too).

### From the landscape
- Scheduled-digest proactivity won (ChatGPT Pulse / Claude Orbit model).
- **Every proactive item cites its receipt** (the captured evidence) — that's
  what makes users act instead of swipe.
- One-party capture only: own screen, own accounts. NO always-on microphone.
  Meeting notes later via explicit per-meeting opt-in (Granola pattern).
- One-click full export as a trust feature.

### From the architecture research (implementation-ready)
- **Event-driven capture** (app switch, focus, click-burst, scroll-stop,
  typing pause) replacing our 5s poll → screenpipe-validated 5-10% CPU,
  no battery complaints (Littlebird's text approach dodged Rewind's fate).
- A11y-tree-first, OCR fallback only; in-process Rust engine (not sidecar).
- **Redact-then-upload boundary**: local PII pass; only structured facts leave.
- **Staged permission primers** (branded full-screen explainer before each OS
  dialog; ~65% grant-rate lift; accessibility first, screen-recording second,
  mic just-in-time-never-for-now).
- Battery tiers: full pipeline on AC; capture-and-queue on battery.
- Overlay: tauri-nspanel non-activating panel + global shortcut (we have the
  panel; needs context-seeding).

## 3. The product — three surfaces, one heartbeat

### Surface 1: THE BRIEF (the heartbeat — daily retention)
One artifact, every morning, compiled overnight from the memory stream
(mirrors + platforms + calendar). Jo-grade density, TwinMe-only ingredients:
- Verdict line (cognitive load + the ONE thing that matters)
- Calendar with conflict detection + prep links (only meetings that pass the
  cycle-1 prep filter)
- 2-3 time-estimated actions WITH receipts ("From your screen yesterday 3pm:
  the PR review you abandoned — ~45 min to finish")
- Active Projects carry-forward (dated evidence, survives until resolved)
- The twin's edge nobody else has: body + culture context fused in ("39%
  recovery + packed afternoon — I'd move the gym block to tomorrow")
Delivery: desktop notification → opens panel card; later email with
reply-to-act. The cycle-1 editorial layer (whitelist, dedup, suppression,
delta-numbers) is the quality gate that makes this non-noise.

### Surface 2: HUMMINGBIRD (the moment of need — invocation utility)
Global hotkey overlay, pre-seeded with: current window context (the clips the
app ALREADY captures — today the panel is context-blind; one wiring change)
+ full memory + personality voice. Jobs: "draft the reply" (in MY voice),
"what's my history with this person", "summarize this with what I know",
"what was I doing before lunch". Action pills become functional (today they
render as dead spans).

### Surface 3: RECALL + THE LEDGER (trust + retrieval)
- Ask-anything search over everything seen/done (mirrors make this real;
  museum pages die, search lives in the panel + web).
- **"What I saw today" review feed**: per-item delete, per-app exclude, tray
  pause — privacy controls AS a visible feature (the Recall lesson), not a
  settings page apology.

## 4. What dies (the "so what?" kill list)

| Surface | Verdict |
|---|---|
| /soul-signature, /you as pages | DIE as destinations. The model lives, powering Brief judgment + Hummingbird voice. One-line "About your twin" in settings. |
| /wiki, /knowledge | DIE. Wiki compilation may continue as twin context; never a page. |
| /brain museum | DIES → becomes Recall search + the Ledger. |
| /twin-soul, /journal, /discover-as-dashboard | DIE. |
| Departments/proposals UI | DEMOTE to Brief items + chat bubbles (already exist there). |
| Web app overall | Becomes: onboarding + connections/settings + Recall archive + account. The DESKTOP is the product. |

Web pages that remain get one job each. Everything else redirects.

## 5. Architecture (target)

```
DESKTOP (Tauri, the product)
  capture: event-driven a11y clips (Rust, in-process) -> local SQLite
  local pass: PII redaction -> fact extraction (cloud LLM today; on-device
              later as local models allow — the Littlebird objection is our
              roadmap, not our launch blocker)
  up: structured facts only -> /api/observations/* -> user_memories
  down (NEW): /api/brief (daily artifact) + push via notification channel
  surfaces: tray, Brief card, Hummingbird overlay (context-seeded), Ledger
WEB (companion): onboarding, connections, Recall, settings
BACKEND (exists): memory stream + retrieval, editorial layer (cycle 1),
  personality model, platform fetchers (post-cut: 7 keepers + mirrors)
MOBILE (later): read-only Brief + chat (Littlebird pattern), not capture
```

## 6. Phasing (each phase ships value alone)

**P1 — Wire the loop (the internal audit's "one week of work"):**
Brief v1 = existing briefing machinery → desktop native notification + panel
card (both ends exist, nothing connects them). Hummingbird context-seeding
from local clips. Functional action pills. Success metric: Brief opened
4+/week.

**P2 — The artifact earns its slot:**
Verdict line, time estimates, receipts-on-every-item, Active Projects
carry-forward (needs a lightweight project-thread tracker over the memory
stream). Brief quality A/B'd against the engagement loop (now measurable
post-cycle-1).

**P3 — Capture 2.0:**
Event-driven engine replacing the 5s poll; review feed + exclusions + tray
pause; staged permission primers; battery tiers. Privacy page rewrite:
"facts, never pixels."

**P4 — The platform reorg:**
Web kill-list executed; desktop-first onboarding (download is the primary CTA);
Routines; per-user email + reply-to-act; mobile read-only.

**Explicitly later/never:** always-on audio (never); meeting notes via
explicit opt-in (later); local LLM extraction (when models allow).

## 7. Pricing posture (reference points)
Littlebird $17-20/mo, Jo $39/mo (family). TwinMe Pro $19-29/mo is credible
once the Brief retains; the current 2-platform/100-msg free tier maps cleanly
(free = extension-only mirrors + weekly brief; Pro = daily brief + Hummingbird
unlimited + all platforms).

## 8. Risks
- **Claude/OpenAI native screen context** commoditizes capture (the HN
  question to Littlebird). Defense: the cross-stream soul (biometrics + music
  + code + money + screen) and the learned personality voice — context they
  won't have.
- Brief quality below Jo's bar on day one → P2 is the product, not polish.
- Capture trust: one bad story kills the category for us — the Ledger and
  redact-boundary ship BEFORE capture expands, honoring the existing in-app
  privacy promises (deletion etc.) first.
```
