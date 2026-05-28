# jo (askjo.ai) — Deep Product Analysis

Source: 20 screenshots of the jo onboarding + main app, captured 2026-05-27 (15:36-15:43, 7 minutes).

---

## 1. Product context

| | |
|---|---|
| **Web tagline** (askjo.ai homepage) | **"Your AI. Your Machine. 10x Faster."** |
| **In-app intro** | "Hi Stefano! Give me a second to look you up..." (animated, first-person) |
| **Positioning claim** | "A personal AI that actually knows you" |
| **Founders** | **Pradeep Elankumaran** (CEO) — ex-Yahoo, ex-Lyft, prior YC S11 (Kicksend) + S16 (Farmstead). **Kevin Li** (CMO) — ex-Yahoo, ex-Kabam, prior YC S16 (Farmstead). Co-founders for a decade; consumer-product builders since the mid-2000s. |
| **YC batch** | **W24** (cited in YC company page) — also referenced as currently active |
| **Founded** | 2023 |
| **Funding** | $500K disclosed. Investors: **Y Combinator**, **Antigravity Capital**, **Hypothesis Studio**, **Resolute Ventures**, plus angels (Taro Fukuyama publicly disclosed his check). |
| **HQ** | San Francisco (per LinkedIn) |
| **Platform** | Native macOS (Apple Silicon only); Telegram + WhatsApp as chat surfaces; iOS/Android native apps "coming soon" |
| **Hardware floor** | **M-series chip (M1-M4), 16 GB RAM minimum.** Most Macs from 2020 onward. |
| **Pricing (in-app onboarding)** | **$39/mo "Early Adopter" pricing, 3 days free** |
| **Pricing (current website)** | Currently **free in beta, no credit card** required |
| **Founders' contact** | `founders@askjo.ai` |
| **Telegram bot deep link** | `https://t.me/jo_prod_bot?start=QY23RX` (the `?start=` token is per-user) |

### Architecture in one diagram

```
                        ┌───────────────────────────────┐
   Your Mac             │   Your dedicated cloud machine │     Cloud LLM providers
   (M-series, 16 GB+)   │   (1 per user, hosted by jo)   │     (OpenAI, Anthropic, Grok, Kimi, Gemini)
  ┌──────────────────┐  │ ┌──────────────────────────┐  │   ┌──────────────────────────────┐
  │ - Local indexer  │  │ │ - Conversation runtime   │  │   │ - Inference                  │
  │ - "Clips" cache  │←─┼─┤ - Task execution         │──┼──→│ - Contractually barred from  │
  │ - Photos/Notes/  │  │ │ - Real browser control   │  │   │   training on your data      │
  │   Slack/Messages │  │ │ - Nightly reflection     │  │   └──────────────────────────────┘
  │ - Transcription  │  │ │ - Mounts as a Finder vol │  │
  │ - Echo cancel    │  │ └──────────────────────────┘  │
  │ - Local model    │  │                                │
  │   (optional)     │  └────────────────────────────────┘
  └──────────────────┘
```

**Key claim**: "Personal data stays on Mac" — photos, screen content, local files. The dedicated cloud machine sees only the indexed "clips" + conversation state.

---

## 2. Design language

### Color palette

- **Background**: very dark navy/charcoal `~#0E1118` → `~#16191F` with a faint film-grain texture.
- **Card surface**: subtle dark grey `~#1B1F26` with hairline border `rgba(255,255,255,0.05-0.08)`.
- **Primary accent / "self" color**: **lavender / periwinkle blue** `~#9AA4F8`-ish, used for jo's avatar circle, the waving-hand emoji background, primary "That's me!" / "Let's go" / "Looks good" / "Next" pill CTAs. Distinctive choice — feels intimate, not corporate.
- **Notification banner**: thin warm-orange/amber pill `~#E8853A` for the persistent "Enable >" CTA inside the top "Enable notifications so I can reach you" black bar.
- **Connected status**: tiny **green circle dot** `✓` (mint green) before connected-account labels.
- **Body text**: soft white `~#E6E8EE` for emphasis; muted grey `~#9CA0AC` for helper/secondary copy.
- **Section header tint**: same lavender as primary but desaturated, used for the lead lines of each card.

### Typography — the defining choice

- **The entire UI is set in a MONOSPACE font.** Almost certainly **Berkeley Mono**, **IBM Plex Mono**, **JetBrains Mono**, or **Departure Mono** family — characters are wide, slab-ish, with neutral terminals.
- This is a deliberate identity move: jo isn't trying to feel like a polished consumer SaaS, it's trying to feel like a **terminal-native, hacker-friendly companion**. Every text — headings, body, button labels, even the chat output — is monospace.
- Sizing hierarchy is small (4 visible sizes max):
  - Hero headlines (~22-28px, mono): "Hi Stefano! Give me a second to look you up..."
  - Card title (~14-16px): "Each morning, you get your briefing cards"
  - Body (~13-14px): card body copy
  - Helper text (~12px): "Tap to edit, x to remove"

### Spacing & shape

- **Card radius**: ~10-14px (smaller than Littlebird's 12-20px), consistent across cards.
- **Pill radius**: full pill on every button and toggle (`border-radius: 9999px`).
- **Card padding**: ~16-20px internal.
- **Vertical gap between cards**: ~12-16px — cards stack tightly into a single column.
- **Column width**: ~720-800px max, centered. Onboarding lives inside what looks like a centered modal with subtle outer dimming.

### Iconography

- Mixed inline emojis (👋, ✨, ☀, 🌙, ✅) and small monospace-style line icons in lavender (🔗 chain for "linked to Canary", 📊 bar-chart for "tiny YouTube footprint", 🧭 compass for "I notice what you're looking at", etc.).
- Brand mark: a small **circular profile picture** of "jo" — looks like a stylized human-portrait avatar painted in deep blues/purples. Sits at top-center of every onboarding screen.
- App icons (Safari, Chrome, Notes, Obsidian, WhatsApp, Telegram, iMessage) use their real product icons — sells legitimacy.
- The "At night I self-reflect" card has a small **node graph illustration** — 6-8 nodes connected by hairline blue lines, with tiny icons inside some nodes (lock, message, chain, file). Visual metaphor for memory consolidation.

### Motion (inferred)

- "I start working on them before you wake up." → the briefing cards are presented as if they came from an overnight batch. Pages animate in as the user scrolls.
- The "Searching for stefano gebara..." status text with the small spinner ✺ — animated.
- "Building suggestions..." loader on the "Want me to run these for you?" card uses a small pulsing dot pattern.
- The onboarding screens **append** new cards as actions complete (instead of replacing them). Connected status (`✓ stefanogebara@gmail.com`, `✓ São Paulo, SP`) stays visible — creates a sense of accumulated progress.

### Window chrome

- The first screen (1536-21) shows a webview with `askjo.ai` URL in the title bar — onboarding *starts in a browser tab*, then transitions to the native app at some point. Notable: doesn't force native install before showing value.
- Later screens drop the URL bar and look like a borderless dark native window. The 1542-49 main-app screenshot reveals a **floating compact panel** rather than a full-screen window — jo is a *desktop sidekick*, not an app you live inside.

---

## 3. Onboarding flow (20 cards, in captured order)

| # | Timestamp | Card | Body / copy | Action |
|---|---|---|---|---|
| 1 | 15:36:21 | **"Hi Stefano! Give me a second to look you up..."** (top banner: "Enable notifications so I can reach you" with Enable > CTA) | Inline DuckDuckGo search panel showing live query `Stefano Gebara site:linkedin.com/in` returning two LinkedIn profiles. Animated "✺ Searching for stefano gebara site:linkedin.com/in" status. | (passive — user just watches) |
| 2 | 15:36:26 | Same heading, **second search visible** | DuckDuckGo panel switches to `Stefano Gebara stefanogebara` → returns Instagram + Facebook results. Status: "Searching for stefano gebara stefanogebara." | (passive) |
| 3 | 15:36:30 | **"Hi Stefano! Your name is pretty popular..."** | "I found a few people with that name — select the ones that are you" + 3 radio options: <br>○ Stefano Gebara with a LinkedIn profile at Canary, educated at IE Business School in Spain<br>○ Someone named Stefano Gebara connected to personal social profiles and a Prezi presentation [...]<br>○ Someone at Canary | "Continue" (disabled until selected) / "None of these are me" text link |
| 4 | 15:36:46 | (background dims) | macOS native **Local Network permission dialog** (in Portuguese, because the user's OS lang is pt-BR): *"Permitir que 'jo' busque dispositivos em redes locais? Isto permitirá que o app descubra dispositivos nas redes, se conecte a eles e colete dados desses dispositivos."* | "Não Permitir" / "Permitir" |
| 5 | 15:37:04 | **"Here's what I found:"** | 4 inferred facts with lavender link/chart icons:<br>🔗 Canary<br>🔗 IE Business School<br>🔗 Spain<br>📊 tiny YouTube footprint | "Not me" (transparent pill) / **"That's me! >"** (filled lavender pill) |
| 6 | 15:37:24 | **(stacked: confirmation + briefing-card preview)** Card 1: *"Your AI machine in the cloud is now live"* — bullets: "All chats & summarized events are stored here. Raw data never leaves your Mac" · "We call the most powerful AI models on your behalf" · "Model providers are blocked from saving or training on your data." Card 2: **"☀ Each morning, you get your briefing cards"** — *"I start working on them before you wake up."* Followed by 5 example briefing cards | (passive scroll demo) |
| 7 | 15:37:38 | Same continued, scrolled down. 6th briefing card visible (Dwarkesh podcast). Footer banner: **"You can ask me to adjust this briefing, and also do other stuff on a schedule for you."** | **"Got it!"** pill |
| 8 | 15:37:54 | **3-card daily-rhythm narrative** (each its own dark card):<br>**☀ Each morning, you get your briefing cards** — *"I start working on them before you wake up."*<br>**✅ More cards roll in all day** — *"I start completing them and offer them to you for finalization."*<br>**🌙 At night I self-reflect and connect all the dots** — node-graph illustration. | **"Next >"** pill |
| 9 | 15:38:01 | New card: **"📧 Things just show up here when they matter."** — *"Calendar, email, and docs — I surface what's relevant without you digging."* | **"M Connect Google >"** + "Set up later" |
| 10 | 15:38:34 | Card updated to show `✓ stefanogebara@gmail.com` + **"M Connect another Google account >"**. **"Next >"** dim. New card revealed: **"📍 Weather, commute, knowing where you are."** — *"Nearby context and travel-aware planning. **Never shared or stored remotely.**"* | **"📍 Enable Location >"** + "Set up later" |
| 11 | 15:38:45 | Location card shows `✓ São Paulo, SP`. New card: **"📒 Something you wrote weeks ago might click today."** — *"I search your notes so old ideas surface exactly when they're useful."* | **"📒 Apple Notes >"** + **"🔮 Obsidian >"** + "Set up later" |
| 12 | 15:39:05 | New card: **"🧭 I notice what you're looking at."** — *"Recent tabs and rabbit holes — things worth revisiting surface at the right time."* | **"🌐 Safari >"** + **"Ⓒ Chrome >"** + "Set up later" |
| 13 | 15:39:22 | Browser card shows `✓ Chrome`, Safari still pending. New card: **"💬 Keeping you caught up."** — *"Daily summaries, mention alerts, and quick catch-up across your group chats."* | **"💬 WhatsApp >"** + **"✈ Telegram >"** + **"💬 iMessage >"** + "Set up later" |
| 14 | 15:39:39 | Messaging card shows `✓ WhatsApp`, `✓ Telegram`, `✓ iMessage`. New card: **"📋 Here's what I learned"** — 5 inferred facts each with small icon. Helper: *"Tap to edit, x to remove"*. | **"Looks good >"** (lavender pill) |
| 15 | 15:40:02 | New card: **"💬 Chat with me anywhere"** — *"Talk to me from your phone via Telegram or WhatsApp — same context, no app needed."* | **"✈ Telegram >"** + **"💬 WhatsApp >"** + "Set up later" |
| 16 | 15:40:46 | Same screen with Telegram URL surfaced: `🔗 https://t.me/jo_prod_bot?start=QY23RX`. | (copyable URL + "Set up later") |
| 17 | 15:42:39 | New card: **"✨ Want me to run these for you?..."** with *"Building suggestions..."* spinner | **"Skip >"** (always available, non-blocking) |
| 18 | 15:42:39 (same) | Final card: **"✨ One last thing"**<br>💰 *"$39/mo — Early Adopter pricing. 3 days free."*<br>💻 *"Apple Silicon, 16 GB RAM — perfect for local models."*<br>👋 *"Need help? Help → Contact Founders, or email founders@askjo.ai"* | **"Let's go >"** (lavender pill) |
| 19 | 15:42:49 | **Main app shell — floating compact panel** (FIRST view of the native app). Top: jo avatar, "Search..." input, ⚡, 👁 0 pill. Then "Enable notifications" banner. Then dismissible **"+ Connect apps, I'll do more for you"** with row of 3 app icons (Safari, Notes, Mail). Bottom: + chat input. | (idle state) |
| 20 | 15:43:33 | Same widget, model picker opened mid-chat. User asked "hey what can you do?"; jo's response: capabilities monologue ending *"I'm annoyingly competent."* Model picker dropdown shows 6 options: Local AI · ChatGPT (selected) · Claude · Grok · Kimi · Gemini. Per-model sub-labels (e.g., "GPT-5.4 Mini / GPT-5.4"). | (active chat) |

### Onboarding patterns worth stealing

1. **Visible search as wow-step** (steps 1-2). The DuckDuckGo iframe literally renders inside the onboarding card with the query and results visible. The user *watches* the AI discover them in real time.
2. **Multiple matches → "select the ones that are you"** (step 3). Acknowledges that the AI might have ambiguous data and asks the user to disambiguate. We never do this — we assume our first hit is correct.
3. **Permission narration matched to each capability**. Step 9: "Calendar, email, and docs — I surface what's relevant without you digging." Step 10: "Weather, commute, knowing where you are. Never shared or stored remotely." Step 12: "I notice what you're looking at. Recent tabs and rabbit holes..." — one line of value-prop per permission.
4. **Card append-don't-replace pattern**. Each connected integration card stays visible with a `✓ accountname` status. The user sees a *growing list of progress* through the entire flow.
5. **First-person voice everywhere**. "I start working on them before you wake up." "I notice what you're looking at." "I search your notes." "I self-reflect." This is jo *talking to you* in present tense, never passive-voice marketing copy.
6. **Inferences-confirmation gate** (step 14). 5 bullet-point inferences ("Linked to Canary", "São Paulo", "Your calendar leans heavily into Thursdays and Tuesdays", etc.) with inline edit (`Tap to edit`) and remove (`x`) controls. Both jo and Littlebird have this; TwinMe does not.
7. **Same wow data, two contexts**. The 4 inferred facts in step 5 ("Canary, IE Business School, Spain, tiny YouTube footprint") are deliberately small and discoverable from public web. Step 14 then upgrades to a 5-bullet *behaviorally-inferred* list (calendar patterns, focus blocks, Portuguese-titled appointments) that proves jo has done real work in the background.
8. **Non-blocking "Building suggestions..." while finishing**. Step 17 shows a card that's *still loading* when the user clicks "Let's go" on step 18. Asynchronous work overlaps with the final cards.
9. **`Set up later` is universal**. Every permission has an opt-out. Reduces drop-off.
10. **Pricing card is the last beat**. They never show the price until *after* the user has invested 7 minutes confirming inferences and connecting accounts. By that point the value is shown; the ask feels earned.

---

## 4. Main app surface

### The widget itself

- **Format**: floating compact panel ~600px wide, transparent dark blurred background. **Not** a full-window app like Littlebird. Sits over your desktop — you can see other windows around it.
- The app appears to be summoned/hidden on demand (no traffic-light buttons visible in the captured screenshots — likely a borderless window).

### Top bar

- **jo avatar** (small circular, left)
- **Search...** large input field (center)
- **⚡ quick-action button** (right)
- **👁 "0" pill** (right) — likely the count of pending tasks or briefing items waiting

### Persistent system banner

- "Enable notifications so I can reach you" — same banner as onboarding, still present in main app. Persistent until user enables.

### Dismissible connect-apps row

- **"+ Connect apps, I'll do more for you"** with `x` dismiss button
- Three app icons: **Safari · Notes · Mail** — these are *uninstalled* integrations being recommended (note: even though the user clicked "Set up later" for Notes and Safari earlier in onboarding, they reappear here as soft prompts).

### Chat composer

- **"+ New topic?"** input field above any active chat — implies hierarchy: a single conversation can branch into topics, and the user can spawn new ones inline.
- **Active chat cards** stack as panels below, each with: 💬 title · "..." overflow · timestamp ("just now") · 🌙 dark-mode toggle for that chat · `x` close
- **Composer footer row**: `@` mention · `📎` attach · **`[🟢 ChatGPT ▾]`** model picker · `↩` send

### Model picker (dropdown)

| Icon | Model | Per-model variants |
|---|---|---|
| ⌬ | **Local AI** | (on-device only) |
| 🟢 ✓ | **ChatGPT** | GPT-5.4 Mini · GPT-5.4 |
| 🟠 | **Claude** | Claude Sonnet 4.6 · Opus 4.6 |
| ⚫ | **Grok** | Grok 4 Fast |
| 🔮 | **Kimi** | K2.5 · K2 Thinking |
| ✦ | **Gemini** | 3.1 Pro · 3.1 Flash-Lite |

**ChatGPT is the default.** The picker UI is a popover, not a settings page — users can change model **per-message**, much more flexible than Littlebird (which routes silently) and more discoverable than what TwinMe does.

---

## 5. Feature areas

### 5.1 Briefing cards (the daily rhythm)

- **Cadence**: 3 phases narrated as "Morning · Day · Night"
  - **Morning**: pre-baked cards delivered before the user wakes up
  - **Day**: more cards "roll in" continuously and offered "for finalization"
  - **Night**: "self-reflect and connect all the dots" — visual node graph implies memory-linking happens overnight (very Generative-Agents-reflection-engine-coded)
- **Card anatomy**:
  - **Icon** (⚡ for actionable, 📊 for trend/data, 📅 for calendar)
  - **Title line** (concrete, dated, specific) — e.g. "Tokyo trip in 9 days — yen is down 3%"
  - **Supporting context line** (1 sentence proving jo did real work) — e.g. "You bought ¥50k last time — same amount at better rate?"
  - **Action button on the right** (contextual: "Remind at 10am" · "Packing list" · "Gift ideas" · "Compare" · "Summarize")
- Each action button text is generated to match the specific card content, not a generic "Open" or "Details."

### 5.2 Daily rhythm narration

The 3-card narrative ("morning / day / night") is the most-stealable copy block in the entire app:

> ☀ **Each morning, you get your briefing cards** — *I start working on them before you wake up.*
>
> ✅ **More cards roll in all day** — *I start completing them and offer them to you for finalization.*
>
> 🌙 **At night I self-reflect and connect all the dots.**

This is *exactly* what TwinMe's reflection engine + proactive insights does, but we never say it out loud.

### 5.3 Voice / chat surfaces

- **Telegram bot**: `https://t.me/jo_prod_bot?start=QY23RX` — one production bot, per-user `?start=TOKEN` deep link binds the bot conversation to the user account. This is the architecture we wanted for our WhatsApp/Telegram surface (we tried Kapso per-number; jo's approach is much cheaper).
- **WhatsApp**: similar pattern (deep link not visible but presumably the same).
- **iMessage**: third surface, **macOS-only** since iMessage requires Apple's continuity bridge.
- **Voice**: marketed on the website as "hands-free queries with local transcription on Mac." Not visible in the captured screenshots, but the website page lists it among core capabilities. Likely uses Whisper.cpp or a similar local model.

### 5.4 Inferences confirmation gate

The "**Here's what I learned**" card in step 14 deserves a section to itself:

| Inference | Type | Source jo used (inferred) |
|---|---|---|
| "Linked to Canary, with a profile that also points to IE Business School and Spain." | Identity | LinkedIn search |
| "Looks like you're in São Paulo, SP." | Location | Browser/OS location after granting permission |
| "Your calendar leans heavily into Thursdays and Tuesdays." | Behavioral pattern | Google Calendar pattern analysis |
| "You've got a few recurring work-focus blocks like GitHub Deep Work, GitHub & Music Focus Session, and Email Zero Sprint." | Habit | Recurring-event detection in Calendar |
| "Your calendar also includes personal and care-related appointments in Portuguese, like psicólogo, Personal, and Academia da Mente." | Cultural/personal context | Multi-lingual event title analysis |

Each row has:
- A small icon (lavender)
- The inference as a single full sentence
- Helper footer: *"Tap to edit, x to remove"*

This is **the canonical inferences UI**. Combined with Littlebird's variant ("Here's what Littlebird picked up" → Activity Summary + Productivity Insights), it's the **single most consistent pattern across both products** — and **TwinMe is missing it**.

### 5.5 Multi-model picker

Already detailed in §4. Key differentiator: each provider exposes 1-2 SKUs in the picker (e.g., ChatGPT shows "GPT-5.4 Mini / GPT-5.4"). The user picks the brand, jo routes to a tier internally. **The fact that "Local AI" sits as a peer to OpenAI/Anthropic/etc. in the same picker is huge** — privacy-conscious users can flip to fully local for sensitive messages with one click.

### 5.6 "Want me to run these for you?" task suggestions

Step 17 shows a card titled **"Want me to run these for you?..."** with a *"Building suggestions..."* loader. This is the jo equivalent of agentic action proposals — at the end of onboarding, the AI proactively suggests scheduled tasks based on what it learned. Skip is always available.

### 5.7 App icon shortcuts

The main-app screenshot (step 19) shows a dismissible row of 3 app icons: **Safari · Notes · Mail**. These act as soft prompts for integrations not yet connected. Clicking presumably re-runs the integration connect flow. Less aggressive than a settings page.

### 5.8 "Clips" (mentioned on website, inferred)

- jo's website says it **indexes browsing patterns "automatically into clips"** stored locally on the Mac.
- A clip is presumably an indexed snippet of something the user looked at, with metadata about when/where/how.
- The cloud machine likely receives only embeddings or summaries, not raw clips.

### 5.9 Real browser control

Per the website, the cloud machine can **"control an actual browser"** — meaning jo doesn't rely on website-scraping APIs. When you ask "Find me a cheaper car insurance option," jo opens a remote Chromium on its cloud machine, navigates to comparison sites, and reads results. Cluely/Browser-Use-style automation.

### 5.10 Nightly reflection loop

- Marketed on the homepage: *"Nightly reflection loop improves assistance without user action."*
- Echoed by the onboarding card: *"At night I self-reflect and connect all the dots."*
- Same conceptual primitive as our `reflectionEngine.js`, but exposed to the user as a daily ritual rather than an internal background job.

---

## 6. Backend signals (inferred + verified)

| Signal | Source | Inference |
|---|---|---|
| **Hybrid execution split** | Website | Local Mac for indexing + storage + transcription; dedicated cloud VM for conversation runtime + browser control + nightly reflection. |
| **Per-user dedicated cloud machine** | Website | One Linux VM per user, **mountable as a drive in Finder**. Implies SSHFS or WebDAV mount over local network. The **Local Network permission** in step 4 was for **mDNS/Bonjour discovery of the cloud machine** (or an LAN proxy). |
| **Files stored as text** | Website | "Files stored as readable, editable text (not black box)" — suggests a markdown- or JSON-based memory format on the cloud machine that the user can SSH into and edit. |
| **Model agnosticism via gateway** | Model picker | OpenAI + Anthropic + Grok + Kimi + Gemini + Local AI all in one picker — implies a unified inference gateway in the cloud VM. |
| **"Clips" memory index** | Website + onboarding | Local SQLite or vector store on the Mac storing time-indexed activity snapshots. |
| **Telegram bot deep-link pattern** | Onboarding step 16 | `t.me/jo_prod_bot?start=USER_TOKEN` — one global bot, per-user binding token, conversation routed server-side. |
| **Browser-control execution** | Website | Cloud VM runs a real Chromium (likely Playwright/Puppeteer) for live web navigation. |
| **DuckDuckGo (not Google) for the initial lookup** | Step 1-2 | Chosen because DDG has a less aggressive bot-detection / no CAPTCHA story for headless browsing. Reveals jo runs *real* web searches at session start, doesn't rely on a paid SERP API for this. |
| **Open-source roots** | Website | Mentions "battle-tested open-source code" and "open-source roots." GitHub org `jo-inc` exists. |
| **Smart routing** | Website | "Quick questions go to fast models; complex research routes to reasoning models." Implies a server-side classifier-and-route layer. |
| **Local transcription** | Website | Voice transcription happens on-device. Likely Whisper.cpp. |

### What we don't know

- The exact cloud-VM size per user (CPU/RAM/storage).
- The cost-per-user economics. $500K seed at $39/mo means they need to land paying users fast, OR the dedicated cloud machine is small/scheduled-down.
- Whether the "clips" index uses pgvector, LanceDB, FAISS, or something custom.
- The native app stack — they mention open source but not Electron/Tauri/Swift specifically. The font-rendering and animation feel suggest **Tauri** or **a custom native shell**, not Electron.
- Whether the nightly reflection runs on the user's Mac or the dedicated cloud machine.

---

## 7. UI primitives catalogue

| Primitive | Where it appears |
|---|---|
| **Monospace everything** | Every text on every screen |
| Dark navy background `#0E1118` | All onboarding screens, main app |
| Lavender accent `#9AA4F8` | jo avatar, primary CTA pills, status icons, inference list icons |
| Warm-orange Enable pill | Persistent notifications banner |
| Mint-green `✓` status | Connected accounts, locations |
| Dark-card with hairline border | Every onboarding card |
| Stacked card append pattern | Onboarding flow (cards persist after action) |
| Briefing-card row with right-aligned action button | Each card in the morning-brief preview |
| Inline DuckDuckGo iframe | First two onboarding cards |
| Radio-list disambiguation | "Your name is pretty popular..." |
| Inferences confirmation list with `tap to edit, x to remove` | "Here's what I found" + "Here's what I learned" |
| Single-bot deep-link `?start=TOKEN` | Telegram chat-anywhere card |
| Pulsing "Building suggestions..." loader | Final onboarding step |
| Floating compact desktop panel (no traffic lights) | Main app shell |
| Top toolbar: avatar · Search · ⚡ · pill counter | Main app |
| Persistent dismissible "Connect apps" row | Main app |
| Per-message model dropdown with sub-SKUs | Chat composer |
| `+ New topic?` inline branch-point | Chat composer above active chats |
| Active chat as a stacked card with `...` overflow + dark/light toggle + `x` close | Main app chat layout |

---

## 8. Strengths vs gaps (vs TwinMe today)

### Where jo is ahead

1. **The visible web-search wow-step (steps 1-2)**. Literally watch jo find you. This is the most cinematic onboarding moment of either competitor. *Steal this.*
2. **First-person, present-tense voice** throughout. "I notice what you're looking at." "I start working on them before you wake up." We use passive voice in most surfaces.
3. **Inferences confirmation gate** (step 14) — 5 bullets with edit/remove. We just shipped a directives table; jo's version is the *initial* inference list, which is one beat earlier.
4. **Multi-model picker exposed to the user** with provider-level brands and SKU sub-options. Smart and discoverable.
5. **"Local AI" as a peer in the model picker**. Lets privacy-paranoid users flip with one click. We can't ship local AI, but we could expose "minimal-context" or "low-trust-data-only" mode similarly.
6. **Single Telegram bot with per-user `?start=TOKEN` deep link**. The architecture we wanted for our messaging surface. *Steal this verbatim.*
7. **Daily rhythm narration** (morning/day/night). We have all three phases as cron jobs but never narrate them.
8. **Card append pattern** in onboarding. Progress accumulates visibly.
9. **"Set up later" universal opt-out**.
10. **Disambiguation step** ("I found multiple Stefano Gebaras, which are you?"). We don't handle ambiguity at all.
11. **Browser control on cloud machine** for live agentic tasks. We don't do agentic execution.
12. **Self-reflection visual** (node graph illustration in step 8). Communicates the reflection engine in a single image.
13. **"Files stored as readable, editable text"** as a stated value. Implies the user can SSH into their cloud machine and edit memory directly. Radical transparency.
14. **Monospace identity** — defensibly different from every other AI assistant. Signals "for serious users."
15. **Pricing-at-the-end pattern** ($39/mo only appears at step 18). 7 minutes of value before the ask.

### Where TwinMe is ahead

1. **Cross-platform (web + mobile)**. jo is Mac-only at launch (M-series, 16GB+). We work on phones, browsers, anywhere.
2. **Memory architecture sophistication**: STDP synaptic plasticity, co-citation links, neuropil routing, expert reflection personas, LLM wiki compilation. jo has "clips" + "nightly reflection" — conceptually similar but architecturally simpler.
3. **Multiple platform integrations as data sources for reflection** (Spotify listening patterns, YouTube watching, Whoop biometrics). jo focuses on Google + local Mac apps.
4. **Soul Signature framing** is a unique narrative jo doesn't have. They lead with "AI that knows you"; we lead with "from resume to soul."
5. **OCEAN + stylometric personality voting layer**. jo doesn't expose any personality-modeling.
6. **Smart routing for cost** (chat-light/standard/deep). jo's model picker is user-facing; ours is invisible to save real money.
7. **Open data exports + Pluggy bank-statement import**. jo doesn't talk about import.

### Where they're roughly tied

- Calendar/Gmail integrations (both do them, both surface similar facts).
- Privacy claims with on-device emphasis (jo more aggressive with the dedicated-cloud-machine pitch).
- Notification reminders and scheduled briefings.

---

## 9. Direct action items for TwinMe (prioritized)

| Priority | Action | Effort | Where in code |
|---|---|---|---|
| **HIGH** | **Visible web-search wow-step**: during onboarding, after the user enters their email, render a "watching the AI find you" screen with a live DuckDuckGo iframe or animated SERP-like cards. Even mocked, the *visual* of the AI working in real time is the strongest first impression of the entire flow. | 2-3 days | `src/pages/onboarding/DiscoveryReveal.tsx` (new) + maybe a server endpoint that drives the timeline |
| **HIGH** | **Inferences confirmation gate**: after onboarding's data pull, show a 5-bullet "Here's what I learned" with `Tap to edit, x to remove` controls. Source: existing `soulSignatureService` + memory stream summaries. | 1-2 days | `src/pages/onboarding/InferencesConfirm.tsx` + reuse `/api/twin-directives` PATCH |
| **HIGH** | **First-person voice rewrite** across `/twin-soul`, onboarding, and proactive-insights surfaces. Replace passive marketing copy with present-tense first-person. | 4-6 hours | UI copy only |
| **HIGH** | **Daily rhythm narration cards** (morning/day/night) in the onboarding flow, mapped to existing crons (`cron-morning-briefing`, `cron-evening-recap`, nightly `cron-twin-self-improvement`). | 1 day | new onboarding step + a `routines` index page |
| **HIGH** | **Disambiguation step** when discovery returns multiple matches. Show radio options: "Which of these is you?" | 1 day | extend `discover-correction-form.tsx` |
| **MED** | **Single Telegram bot with per-user `?start=TOKEN` deep link**. Replaces our Kapso-per-number WhatsApp attempt. One bot, many users. | 1-2 days | new route `/api/twin-telegram-webhook` + BotFather setup |
| **MED** | **Multi-model picker visible in twin chat** (currently silent smart routing). Default = our smart router; manual override = Sonnet 4.6 / Opus 4.6 / DeepSeek / Gemini. | 1 day | `src/pages/TwinChatPage.tsx` composer |
| **MED** | **"Self-reflect" visualization** (node-graph illustration of memory links) on `/twin-soul` or `/wiki` page. We have the data (memory_links table); just need d3-force render. | 2 days | `src/pages/components/SelfReflectGraph.tsx` |
| **MED** | **Pricing-at-the-end pattern**. Move our pricing reveal to *after* the user has seen their Soul Signature, not before. | 2 hours | onboarding step reorder |
| **MED** | **"Set up later" universal opt-out** on every integration step in `/connect`. | 4 hours | UI standardization |
| **MED** | **Persistent system banner pattern** for un-granted permissions (notifications, mic). Adopt jo's persistent top bar. | 4 hours | `src/components/SystemBanner.tsx` |
| **LOW** | **Monospace section toggle** as a font option in settings (purely aesthetic, but signals "for serious users"). | 2 hours | font system addition |
| **LOW** | **Per-message model badge** in chat history (shows which model answered which message). | 2 hours | metadata field display |
| **LOW** | **Stacked card append pattern** during the soul-signature reveal — each integration's confirmation persists. | 1 day | UI refactor |

---

## 10. Notable phrases worth stealing verbatim

- "Hi Stefano! Give me a second to look you up..." (welcome screen)
- "I found a few people with that name — select the ones that are you" (disambiguation)
- "I start working on them before you wake up." (morning briefing)
- "More cards roll in all day. I start completing them and offer them to you for finalization." (daytime)
- "At night I self-reflect and connect all the dots." (reflection)
- "Things just show up here when they matter." (integration value-prop)
- "Calendar, email, and docs — I surface what's relevant without you digging." (Google connect)
- "Nearby context and travel-aware planning. **Never shared or stored remotely.**" (location)
- "Something you wrote weeks ago might click today. I search your notes so old ideas surface exactly when they're useful." (notes)
- "I notice what you're looking at. Recent tabs and rabbit holes — things worth revisiting surface at the right time." (browser)
- "Daily summaries, mention alerts, and quick catch-up across your group chats." (messaging integrations)
- "Talk to me from your phone via Telegram or WhatsApp — same context, no app needed." (chat surface)
- "All chats & summarized events are stored here. Raw data never leaves your Mac." (privacy)
- "We call the most powerful AI models on your behalf." (LLM routing as a feature)
- "Model providers are blocked from saving or training on your data." (compliance)
- "For most digital grunt work, I'm annoyingly competent." (capabilities, ending)
- "Tap to edit, x to remove" (inferences confirmation)

---

## 11. Open questions worth answering before copying

1. **How does the dedicated cloud machine economics work at $39/mo?** Even a minimal cloud VM costs ~$5-15/mo before considering LLM inference. Either they're heavily subsidizing seed-runway-style, or the VM scales to zero when idle.
2. **What's the local-Mac stack?** Native Swift app, Tauri, or Electron? The monospace font + smoothness suggests Tauri or native, but unclear.
3. **How do they avoid Kapso-style WhatsApp pricing?** A single bot per platform is much cheaper than per-user numbers; same is likely true for WhatsApp Business API. Probably they use the Cloud API tier directly.
4. **Is the "clips" index encrypted at rest, or just access-controlled?** Important for our own privacy story.
5. **Does the nightly reflection run on the user's Mac or the cloud VM?** Has cost implications.
6. **How do they handle multi-device (when the iOS/Android apps ship)?** Per-user dedicated VM should make cross-device sync trivial, but the local "clips" index on the Mac complicates things.

---

## 12. Comparison vs Littlebird (the other thread)

| | jo | Littlebird |
|---|---|---|
| Architecture | Half Mac + half dedicated cloud VM | Pure Mac app, accessibility-tree polling |
| Mac hardware floor | M-series, 16 GB | Apple Silicon (no RAM floor disclosed) |
| Onboarding signature moment | **Visible web-search of you** | **3-minute passive observation demo** |
| Inferences confirmation | "Here's what I learned" (5 bullets) | "Here's what Littlebird picked up" (Activity Summary + Productivity Insights) |
| Chat surfaces | macOS app + Telegram + WhatsApp + iMessage (+ voice) | macOS app only |
| Model picker | User-visible, 6 providers + Local AI | Hidden; "Max" mode toggled per message |
| Pricing | $39/mo (Early Adopter) | Basic free / Plus $17/mo / Pro $100-200/mo |
| Memory-edit UI | Inline edit on inference list | Single "Assistant Notes" textarea + "Custom Instructions" textarea |
| Identity / typography | **Monospace, terminal-coded** | Editorial: dark forest illustration + serif headings + sans body |
| First-person voice | Heavy. "I notice...", "I search...", "I self-reflect" | Mild. "Littlebird picked up...", neutral copy mostly |
| Permission narrative | One sentence value-prop per permission | One sentence per permission + persistent trust statement |
| Routines / scheduled briefings | Daily rhythm cards (morning/day/night) in onboarding | Dedicated **Routines** tab with 4 prebuilt templates + custom builder |
| Disambiguation step | Yes ("multiple Stefano Gebaras...") | No |
| Single-bot deep link | Yes (`t.me/jo_prod_bot?start=TOKEN`) | N/A (Mac-only) |
| Privacy: per-app exclude | N/A (different model) | Yes, with category presets |
| Tab-style chat browser | Card-stack of "active asks" | Browser-style Cmd+T tabs |
| Meeting transcription | Mentioned, not captured | First-class feature (Note/Summary/Transcript) |
| Most stealable single feature | **Visible search at session start** | **3-minute live observation demo** |

---

## 13. Sources

- [askjo.ai homepage](https://askjo.ai/)
- [Y Combinator company page — jo](https://www.ycombinator.com/companies/jo)
- [YC launch announcement — jo 1.0](https://www.ycombinator.com/launches/PZb-jo-1-0-a-personal-ai-that-actually-knows-you)
- [Welcome.AI — jo company profile](https://www.welcome.ai/company/jo)
- [GitHub — jo-inc organization](https://github.com/jo-inc)
- [LinkedIn — jo (YC W24) company page](https://www.linkedin.com/company/askjoai)
- [PitchBook — Jo 2026 company profile](https://pitchbook.com/profiles/company/756939-43)
- [HighPerformr — jo (YC W24) HQ + global offices](https://www.highperformr.ai/company/askjoai)
- [Taro Fukuyama LinkedIn post — invested in jo (YC W24)](https://www.linkedin.com/posts/tarof_very-excited-to-invest-in-jo-yc-w24-activity-7277049708043255809-APKl)
- [Y Combinator LinkedIn post — jo voice-first AI](https://www.linkedin.com/posts/y-combinator_jo-yc-w24-is-a-voice-first-digital-personality-activity-7277013185667194880-0B8j)
