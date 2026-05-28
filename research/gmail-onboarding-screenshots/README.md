# Competitor Onboarding Screenshots — askjo + Littlebird

Source: Gmail threads from Luciana Chapchap to stefanogebara@gmail.com, 2026-05-27.

---

## Contents

### `twinme-platforms/` (36 screenshots, Thread `19e6ab502134af2d`)
- **Product**: Littlebird (`Littlebird v0.78.22`) — Mac desktop AI assistant
- **Tagline**: "Connect everything. Ask anything."
- **Positioning**: enterprise-leaning productivity AI with passive context awareness
- **Captured timeline**: 15:13:10 → 15:29:22 (16 minutes)
- Filename: `platforms-HHMM-SS.png` (e.g., `platforms-1513-10.png` = 15:13:10)

### `askjo/` (20 screenshots, Thread `19e6ac6c9e541009`)
- **Product**: jo (askjo.ai)
- **Tagline**: "I'm your personal AI assistant"
- **Positioning**: local-first agentic assistant on Apple Silicon
- **Pricing**: $39/mo, 3-day free trial, Early Adopter pricing
- **Requirements**: Apple Silicon, 16 GB RAM
- **Captured timeline**: 15:36:21 → 15:43:33 (7 minutes)
- Filename: `askjo-HHMM-SS.png`

---

## 1. askjo (jo) — Local-first agentic Mac assistant

### One-line pitch
A personal AI that lives on your Mac, watches your stuff, and surfaces briefing cards before you ask.

### Onboarding flow (in order, by screenshot timestamp)

| Step | What you see | TwinMe takeaway |
|---|---|---|
| 1 (15:36:21) | "Hi Stefano! Give me a second to look you up..." while the screen literally shows a DuckDuckGo search for `Stefano Gebara site:linkedin.com/in` running | **INSTANT WOW**: discovery happens *visibly* — the user watches it search the open web for them. We currently do this silently behind a spinner. |
| 2 (15:36:26) | macOS local-network permission dialog | Pure-native Mac app, asks for system-level perms up front. |
| 3 (15:36:30) | "Not me" / "That's me!" with: Canary · IE Business School · Spain · tiny YouTube footprint | **Identity verification gate**. Forces the user to acknowledge what was found before continuing. We don't do this — we should. |
| 4-5 (15:36:46-15:37:04) | Permission accepted, "Here's what I found:" explicit confirmation page | — |
| 6 (15:37:24) | Morning briefing-card mockup (preview, not real data): "Perfect running weather", "Tokyo trip in 9 days — yen is down 3%", "Mom's birthday is Friday", "Car insurance renews Thursday", "Dinner tonight at 7:30 — all confirmed", "New Dwarkesh — AI hardware scaling" | **DEMONSTRATE THE VALUE BEFORE ASKING FOR PERMISSIONS**. They show the user what their morning will look like — *then* ask for Google access. |
| 7 (15:37:38) | Same briefing screen, scrolled, with footer "You can ask me to adjust this briefing, and also do other stuff on a schedule for you. — Got it!" | Sets expectation: ambient + on-demand. |
| 8 (15:37:54) | Three integration cards stacked: <br>1) **Each morning, you get your briefing cards** — "I start working on them before you wake up."<br>2) **More cards roll in all day** — "I start completing them and offer them to you for finalization."<br>3) **At night I self-reflect and connect all the dots** — small node-graph illustration<br>4) **Things just show up here when they matter** — Connect Google / Set up later | **Daily rhythm framing.** Morning / day / night. Our memory system has the same shape (observation → reflection) but we never *narrate* it to the user. |
| 9 (15:38:01) | Confirmed Google account connected, "Connect another Google account" CTA | — |
| 10 (15:38:34) | **Weather, commute, knowing where you are** — "Nearby context and travel-aware planning. **Never shared or stored remotely.**" — Enable Location / Set up later | Privacy phrasing as a feature: "Never shared or stored remotely." We could borrow this verbatim for our privacy spectrum. |
| 12 (15:39:05) | **Something you wrote weeks ago might click today** — Apple Notes / Obsidian / Set up later <br>**I notice what you're looking at** — Safari / Chrome / Set up later (recent tabs + rabbit holes) | Browser activity = first-class data source. We have a browser extension but don't talk about it like this. |
| 13 (15:39:22) | **Keeping you caught up** — WhatsApp / Telegram / iMessage — "Daily summaries, mention alerts, and quick catch-up across your group chats." | Messaging surface is **inbound** (jo reads your messages), not outbound. We tried outbound (twin sends *from* WhatsApp) — wrong direction. |
| 16 (15:40:46) | **Here's what I learned**: "Linked to Canary, with a profile that also points to IE Business School and Spain" / "Looks like you're in São Paulo, SP" / "Your calendar leans heavily into Thursdays and Tuesdays" / "You've gathered a few recurring work-focus blocks like GitHub Deep Work, GitHub & Music Focus Session, and Email Zero Sport" / "Your calendar also includes personal and care-related appointments in Portuguese, like paicólogo, Personal, and Academia da Mente" — "Tap to edit, x to remove" | **CRITICAL PATTERN**: jo shows the user the *inferences* it's made, with edit/delete controls. This is `/twin-soul` for inferences, not just directives. We just shipped this for *corrections*; jo does it for *initial extraction*. |
| 17 (15:42:39) | **Chat with me anywhere**: Talk to me from your phone via Telegram / WhatsApp — same context, no app needed. URL `https://t.me/jo_prod_bot?start=QY23RX` + "Set up later" | Confirms what we tried — Telegram + WhatsApp as the conversational surface. **They use a single Telegram bot with a per-user start param**, not a per-user phone number. Much cheaper than what we attempted with Kapso. |
| 18 (15:42:49) | **Want me to run these for you?** "Building suggestions..." (animated loader) — Skip | Suggested-actions UX with a non-blocking skip. |
| 19 (15:43:05) | **One last thing**: "$39/mo — Early Adopter pricing. 3 days free." / "Apple Silicon, 16 GB RAM — perfect for local models." / "Need help? Help → Contact Founders, or email founders@askjo.ai" / Let's go > | Hardware gate is a *feature claim* ("local models") not a limitation. |
| 20 (15:43:33) | **Assistant capabilities overview**: "A lot. I can handle your email, calendar, reminders, contacts, notes, Drive files, flights, Airbnbs, weather, finance data, photos, local message search, web research, and YouTube transcripts. I can also draft emails, create events, build slides, generate images, make charts, set recurring automations, and remember useful facts about you. I can't buy things, place orders, or make phone calls, but for most digital grunt work, I'm annoyingly competent." Model picker: ChatGPT (GPT-5.4 Mini / GPT-5.4), Claude (Sonnet 4.6 / Opus 4.6), Grok (Grok 4 Fast), Kimi (K2 X / K2 Thinking), Gemini (3.1 Pro / 3.1 Flash-Lite) — plus a "Local AI" toggle | **User picks the model.** TwinMe routes silently. There's a case for surfacing this to power users. |

### Patterns to steal for TwinMe

1. **Visible discovery** — Show the actual web search running in the first 5 seconds. We bury this.
2. **"Here's what I found / Here's what I learned"** — explicit confirmation gates with edit/remove inline. Apply this to soul-signature traits, not just our new directives table.
3. **Demonstrate before permission** — Mock the briefing card *before* asking for Google access. We ask for Spotify/YouTube auth before showing any value.
4. **Briefing-card cadence narration** — "I start working on them before you wake up. More roll in all day. At night I connect the dots." Steal this *exact* framing for proactive insights / morning briefing.
5. **Privacy phrasing**: "Never shared or stored remotely" → adopt verbatim on PrivacySpectrumDashboard.
6. **Single Telegram bot with per-user `?start=XXX` deep link** — cheaper alternative to our Kapso WhatsApp setup. Worth prototyping for /talk-to-twin's mobile surface.
7. **Inferences-as-edit-list UX** — jo's "Here's what I learned" with tap-to-edit-or-remove is what `/twin-soul` should look like for the personality profile *too*, not just learned directives.

### Patterns NOT to copy

- Hardware gate (Apple Silicon + 16GB) — locks us out of mobile-first users.
- $39/mo from day 1 — they can do this because they're local-only. TwinMe burns API tokens; we'd lose money.
- Local-only architecture — incompatible with our cross-device, cross-time soul-signature reflection cron.

---

## 2. Littlebird (`v0.78.22`) — Productivity AI with passive context

### One-line pitch
A Mac desktop assistant that watches what apps you use and ties it to your meetings, mail, and projects.

### Onboarding flow

| Step | What you see | TwinMe takeaway |
|---|---|---|
| 1 (15:13:10) | "Welcome to Littlebird — Your AI assistant that understands your work context and helps you stay focused" / Sign Up or Sign In / By using Littlebird, you agree to our Terms and have read our Privacy Policy | Lush dark-green nature illustration — not the typical SaaS gray. We could push our background gradient even further into this kind of natural-world feel. |
| 2 (15:14:10) | **Set Up Your Preferences**: First Name / Last Name / How did you hear about us? / Other names you go by (helps Littlebird recognize you in messages, emails, and meetings) | The "Other names you go by" field is brilliant — captures aliases, nicknames, online handles. We should add this to `coreMemoryService` blocks. |
| 4 (15:17:15) | **See Littlebird in action** — "Switch to another app. Use your Mac normally for a couple of minutes. Learning in progress... 03:01" | **Live demo as part of onboarding**. They make you USE your computer normally for ~3 min while Littlebird passively records context. We don't have an equivalent "show what we picked up" moment. |
| 5 (15:20:05) | **Here's what Littlebird picked up**: "Activity Summary: You just opened Google Chrome briefly before switching to Safari to browse trending designer bags on Mytheresa. You also have tabs open for Mii Collection and renting a car in Milos." / "Productivity Insights: It looks like you are planning a summer vacation to Greece! I can help you build a complete travel itinerary for Milos, track prices for those Chloé and Loewe bags you were eyeing, and organize your car rental arrangements." | **THE WOW MOMENT.** They observe Chrome + Safari for 3 minutes and produce a personalized travel-planning offer. This is the soul-signature reveal we keep failing to deliver in under 60 seconds. Steal this exact pattern: short observation window → concrete actionable insight. |
| 6 (15:21:47) | **Connect everything. Ask anything.** — "Connect the apps you actually work in — Gmail, Slack, Notion, GitHub, and 95 more." / "Ask Littlebird about your emails, meetings, files, and tasks — all in one place." / "Toggle access per chat. You decide what Littlebird can see, always." / Set up integrations | **Per-chat permission toggles** — we have nothing like this. Granular access control as a *feature*. |
| 7 (15:22:25) | **Add integrations** modal: search + filter + "Add custom (Plus)" / Apple Calendar (Plus), Apple Reminders (Plus), Gmail (free), Google Calendar (free), Google Drive (Plus), Outlook (Plus), AdsInsight (Plus), Ahrefs (Plus)... | Free vs Plus tier per integration. Their Plus model includes Apple-native + Outlook + niche analytics tools. |
| 11 (15:25:07) | **Settings → Meetings**: Exclude Events Without Guests / Meeting App Detection Alerts / Auto-Start Recording on Detection / Auto-Stop Inactivity Timeout (15 min) / Hide Widget From Screen Sharing / Menu bar calendar / Include events (Today & Tomorrow) / Preview upcoming event in menu bar (3 hours before event) | **Meeting transcription is a first-class feature** with thoughtful defaults (e.g., hide-during-screen-share). We don't do meetings at all yet. |
| 13 (15:25:28) | **Settings → General**: What should Littlebird call you / Aliases / Timezone (Horário Padrão de Brasília, detected from your devices) / "Use this device to determine timezone" toggle / Email / Littlebird v0.78.22 (Stable) | Auto-detected timezone, device-as-source-of-truth toggle. We hardcode UTC in `twinSystemPromptBuilder.js`. |
| 15 (15:27:17) | **Main app — "What's on your mind today?"**: large chat input with suggested-prompt chips: "Can you help research something on the web?" / "How are you different from typical chatbots?" / "Get most important news in all continents" / "More suggestions" / Bottom: "Gift 2 months free — Earn $40 in credit when they subscribe — Copy Invite" | Identical layout to our `/talk-to-twin`. Their suggestion chips are *more useful* than ours. |
| 16 (15:27:31) | New Chat / Search / Meeting Notes (Beta) / Routines / Projects (e.g., "Greece Trips") / Recents / "Context enabled" toggle in sidebar | **Projects** as first-class grouping. We don't have this. |
| 17 (15:28:05) | **Routines** tab: "Create Custom Routine" / Morning Brief (Daily at 7:00) / End of Day Wrap-Up (Daily at 17:00) / Weekly Reflection (Weekly on Monday at 6:00) / Monthly Review (Monthly on the 1st at 7:00) | **Routines as scheduled briefings** — our cron infrastructure already supports this (`cron-morning-briefing.js`, `cron-evening-recap.js`). We just need the user-facing UI to manage them. |
| 19 (15:28:37) | **Data and Privacy popover**: "Context Awareness — Littlebird remembers your work across apps, no integrations needed. Learn more →" / Pause Context Awareness ▸ [5 min / 15 min / 30 min / An hour / Until next launch] / Delete Data / "Exclude apps and websites Littlebird can access context from — Manage" / Context enabled • | **Easy temporary pause + per-app exclusion**. We have feature_flags but no user-visible per-source pause. |

### Patterns to steal for TwinMe

1. **3-minute live demo** — short passive-observation window that culminates in a concrete personalized offer. THE move for instant-wow during onboarding. Could be Spotify-listening or browser-extension based.
2. **"Other names you go by" / Aliases field** — captures nicknames, email handles, etc. Add to core memory blocks.
3. **Per-chat access toggles** — let users dial what the twin can see *for that conversation only*. Big trust win.
4. **Auto-detected timezone with device-as-source toggle** — we hardcode UTC; this is a 30-min fix.
5. **Routines as user-managed schedules** — surface the existing cron jobs as user-configurable Morning Brief / Evening Recap / Weekly Reflection / Monthly Review tiles. We already run all of these as crons — just expose them.
6. **Projects as first-class container** — group conversations by topic/trip (e.g., "Greece Trips"). Could map to our memory `category` field.
7. **Pause context-awareness for X minutes** — feature_flags has the infra; add a user-facing button. Bonus: per-app/per-domain excludes.
8. **Useful suggestion chips** — replace our generic prompts with concrete research-task examples.
9. **Referral mechanic** — "Gift 2 months free, earn $40 in credit when they subscribe." We don't have referrals at all.

### Patterns NOT to copy

- Free + Plus per-integration paywall — fragments the product. We'd rather single-tier.
- Mac-only desktop app — cuts mobile completely.
- Sign-up form with first/last name + "how did you hear about us" — friction. Cofounder.co-style email-only lookup is better.

---

## 3. Cross-cutting observations

### What both products do that we don't

1. **Explicit "Here's what I picked up" reveal screen** within the first 5 minutes — both products dedicate a full screen to *showing the user what the AI learned*. The `/onboarding-soul-signature` route comes closest but feels like a long-form essay, not a curated bullet list with edit/remove controls.

2. **Per-permission narrative**: instead of one big "connect your accounts" page, both products walk you through one connection at a time with a tiny *what-this-enables* paragraph. Our `/connect` page is a grid of icons — much less compelling.

3. **Tone of voice in onboarding**: jo says "I start working on them before you wake up", "I'll do more for you", "I notice what you're looking at". First-person, present-tense, agentic. Our copy is often passive ("Your twin learns from..."). Steal the voice.

4. **The 3-minute "watch me work" demo** (Littlebird) and the **live LinkedIn search** (jo) — both products make the AI's discovery *visible* during onboarding. Our discovery happens behind a spinner.

### Where TwinMe is already ahead

1. **Cross-platform memory stream** — jo is Mac-only, Littlebird is Mac-only. We work across web, mobile, and (in progress) WhatsApp/Telegram.
2. **Multi-LLM strategy with smart routing** — both products let you pick the model, but neither routes intelligently per query (chat-light vs chat-deep). Ours saves real money at scale.
3. **Generative Agents reflection engine** — neither competitor talks about *why* memories decay, get co-cited, or get reflected on. Our STDP + reflection-engine architecture is genuinely more sophisticated.
4. **Soul-signature framing** — "from resume to soul" is a stronger story than "productivity AI" or "personal assistant".

### Direct action items (TwinMe-side)

| Priority | Action | Effort | Where |
|---|---|---|---|
| HIGH | Add "Here's what I picked up" confirmation screen post-soul-signature with inline edit/remove controls | 1-2 days | `src/pages/onboarding/SoulSignatureReveal.tsx` (new) |
| HIGH | Steal jo's daily-rhythm narration ("I start before you wake up...") for `/twin-soul` empty state and onboarding | 1 hour | copy edit only |
| HIGH | Borrow "Never shared or stored remotely" privacy phrasing for `PrivacySpectrumDashboard` | 1 hour | copy edit only |
| MED | Aliases / nicknames field in onboarding → push into `coreMemoryService` blocks | 2 hours | `src/pages/onboarding/AliasesStep.tsx`, `coreMemoryService.js` |
| MED | Auto-detect timezone (replace hardcoded UTC) | 2 hours | `twinSystemPromptBuilder.js` + frontend |
| MED | "Routines" UI tab surfacing existing crons as user-configurable | 1 day | new route + reuse existing cron infrastructure |
| MED | Per-chat permission toggles | 2 days | new field on `twin_conversations` + UI |
| LOW | Per-app/per-domain context excludes | 3 days | new `user_excluded_sources` table |
| LOW | Better suggestion chips on `/talk-to-twin` (concrete research prompts) | 1 hour | copy edit |
| LOW | Single Telegram bot with `?start=USER_TOKEN` deep-link pattern | 1 day | new route + Telegram BotFather setup |
| LOW | Referral / invite credit mechanic | 2-3 days | new tables + UI |

### Final read

**askjo** is impressive at the onboarding storytelling layer — it makes the user feel watched-over in a friendly way. The architecture is fundamentally local, which is great for trust but bad for the cross-device life we want TwinMe to enable.

**Littlebird** is impressive at the *settings + integrations* layer — it's the most polished "I am a serious productivity tool" experience. The 3-minute live-observe demo is the best moment, and we should copy it almost verbatim using our browser extension as the data source.

Neither has TwinMe's soul-signature framing. Neither does the recursive reflection engine. Neither has the cross-device, cross-time memory architecture we've spent the last six months building. The opportunity is real — we're just losing the first 5 minutes of onboarding to invisible work.
