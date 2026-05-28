# TwinMe Competitor Analysis: Littlebird + jo

Comprehensive deep-dive on the two competitor onboarding flows captured 2026-05-27, sourced from 56 screenshots (36 Littlebird + 20 jo).

**Originals**: `research/gmail-onboarding-screenshots/twinme-platforms/` (Littlebird) and `research/gmail-onboarding-screenshots/askjo/` (jo).

---

## Part 1 — Littlebird


Source: 36 screenshots of Littlebird v0.78.22 (Stable channel), captured 2026-05-27.

---

## 1. Product context

| | |
|---|---|
| **Tagline (welcome screen)** | "Your AI assistant that understands your work context and helps you stay focused" |
| **Tagline (chat home)** | "Connect everything. Ask anything." |
| **Positioning claim** | "The only AI that already knows what you're working on" |
| **Founders** | Alexander Green, Alap Shah, Naman Shah |
| **HQ** | San Francisco |
| **Founded / launched** | March 2026 |
| **Seed** | $11M led by **Lotus Studio**; angels: Lenny Rachitsky, Scott Belsky |
| **Platform** | Native macOS (Windows on roadmap); iOS + Android companion apps |
| **Captured app version** | v0.78.22 (Stable channel) |
| **Compliance** | SOC 2, GDPR, CCPA. Data never used for model training. Encrypted in transit + at rest on AWS. |

### How it actually works (per their own support docs)

- Reads **text + accessibility-tree elements of the active application window** every ~2 seconds. NOT screen recording, NOT screenshots, NOT keystroke logging.
- Captures: visible text, app names (Slack, Chrome, etc.), document/email/website content currently rendered.
- Skips: password fields (auto-ignored), minimized windows, private browsing windows.
- Requires macOS Accessibility permission (system-level prompt).
- Has special Google Docs handling: instructs user to enable Chrome screen reader (Cmd+Option+Z) for cleaner OCR of Docs.
- Backend storage = private encrypted index on AWS.

---

## 2. Design language

### Color palette

- **Off-white background**: ~`#F7F4ED` (cream-paper) for the main app surface and onboarding left panels.
- **Card surface**: pure white `#FFFFFF` for setting cards, integration tiles, chat messages.
- **Dark accent**: near-black `#0F1112`-ish for primary CTAs, sidebar text, system text.
- **Toggle accent**: bright blue `#3B82F6`-ish, classic iOS-style toggle when ON.
- **Connected status**: mint-green pill `#D9F4DC` with darker green text.
- **Beta tag**: lavender pill `#E9E4FF` with purple text.
- **Forest-green hero illustration**: `#1A2D1F` → `#2F4030` — dark, painterly grass/garden. Used on the welcome screen and as the right-side preview panel on every onboarding step. Photo-illustration style, hand-painted feel — distinctly *un-SaaS*.
- **Floating-logo "Connect everything" screen** breaks the green dark with a sky/meadow gradient (blue → green) and circles app logos around the Littlebird bird mark. Lush, almost storybook.

### Typography

- **Headings (page titles like "Meetings", "Routines")**: appear to be a **transitional serif** (Tiempos / Caladea / similar). Larger sizes are crisply serif; smaller "Set Up Your Preferences" titles fall back to sans.
- **Body / UI**: a humanist sans-serif (looks like Inter or Söhne). Weight 400 for body, 500-600 for labels and CTAs.
- **Monospace** used inside transcript / code areas.
- **Hierarchy is generous**: page title 24-28px, section headers 18px, body 13-14px, helper text 12px.

### Spacing & shape

- **Card radius**: ~12px for setting cards and integration tiles; ~16-20px for top-level panel surfaces; ~20-24px for the main chat input.
- **Pill radius**: full pill on tabs, suggestion chips, Beta tags, Connected badges, "+ New Note".
- **Padding**: tile internal padding ≈ 16-20px; settings row padding 14-16px; section vertical gap ≈ 24-32px.
- **Sidebar width**: ~200px (settings sub-nav), wider for the app sidebar (~240px).
- **Modal overlay**: dimmed background, modal sits centered with rounded corners and subtle shadow.

### Iconography & illustrations

- Stroke icons throughout (Lucide-feel: 1.5-2px stroke, rounded ends).
- The brand mark is a stylized white hummingbird on dark background, a black silhouette bird in the sidebar/header.
- Right-panel onboarding previews use *real* illustrative output, not skeleton placeholders — they show a meeting list, a follow-up email draft, a flying-logo cluster, etc. Sells the value *visually* on every step.
- The traffic-light buttons (red/yellow/green) are visible on every screen — it's a `vibrancy: window` macOS window, not a borderless web app.

### Motion (inferred from layouts)

- Settings rows use long-press style toggles; the OFF→ON state animates color.
- The "Learning in progress... 03:01" countdown implies a smooth circular progress + countdown timer.
- The "Connect everything" floating-logo scene is visually static in screenshots but the layout (logos in mid-air with birds + dots) is designed for a parallax/float animation.

---

## 3. Onboarding flow (10 steps, in captured order)

| # | Timestamp | Screen | Body copy | Permissions / CTAs |
|---|---|---|---|---|
| 1 | 15:13:10 | **Welcome** | "Welcome to Littlebird. Your AI assistant that understands your work context and helps you stay focused." | "Sign Up or Sign In" (single light pill button) + ToS/Privacy link footer |
| 2 | 15:14:10 | **Set Up Your Preferences** | "This helps Littlebird personalize your experience. You can update it later." | Fields: First Name · Last Name · How did you hear about us? (select) · **Other names you go by (optional)** — placeholder *"e.g. usernames, email handles, nicknames"* with helper *"Helps Littlebird recognize you in messages, emails, and meetings."* / "Continue" + "Signed in as <email>. Switch account" |
| 3 | 15:14:57 | **Enable Context Awareness** | "This lets Littlebird understand what's on your screen and provide relevant assistance." | Card: "Accessibility Permission — Allow Littlebird to read on-screen text for context." → **Grant Access** (light pill) — opens macOS System Settings → Accessibility, toggle Littlebird on / **"Text only. No screen recording. You control which apps to include and can delete data anytime."** |
| 4 | 15:15:48 | **Automatic Meeting Notes** | "Littlebird can transcribe meetings and generate structured summaries for you." | Card: "Microphone Access — Capture audio in meetings you join." → Allow Permission / **"Audio is processed securely and only during meetings. You stay in control."** / Continue + "Skip for now" |
| 5 | 15:16:09 | **Connect Your Tools** | "Littlebird can use your connected tools to provide more relevant, timely help." | Google Calendar + Gmail prebuilt cards (both **already connected** before this screen — implies the sign-up step did Google OAuth in the background). Right panel: a sample "Follow up with Jason" action showing how cross-tool reasoning works. |
| 6 | 15:16:23 | **Hummingbird (OFF state)** | "Open Littlebird from anywhere and ask about what's on your screen." | "Enable Hummingbird" toggle / 3 bullet rows: "Ask questions about anything on your screen" · "Stay in flow with context-aware answers without app switching" · "Ask questions about your ongoing meeting in real time" |
| 7 | 15:16:36 | **Hummingbird (ON state)** | (same screen with toggle ON) | "Press this combination anywhere to open Littlebird" shows ⌥+⌥ glyph; "Want a different shortcut? Click to record a new shortcut" → "Tap Option twice ▾" dropdown |
| 8 | 15:17:15 | **See Littlebird in action** | "Here's a quick preview of what Littlebird can understand about your workflow." | Card: "Switch to another app. Use your Mac normally for a couple of minutes." with a 3-min progress bar "Learning in progress... 03:01" — user is forced to walk away and use their Mac normally |
| 9 | 15:20:05 | **Here's what Littlebird picked up** | "This is just a preview. Littlebird gets smarter the more you use it." | Two blocks: **Activity Summary** ("You just opened Google Chrome briefly before switching to Safari to browse trending designer bags on Mytheresa. You also have tabs open for Mii Collection and renting a car in Milos.") + **Productivity Insights** ("It looks like you are planning a summer vacation to Greece! I can help you build a complete travel itinerary for Milos, track prices for those Chloé and Loewe bags you were eyeing, and organize your car rental arrangements.") + **Continue** |
| 10 | 15:21:47 | **Connect everything. Ask anything.** (transition modal) | "Connect the apps you actually work in — Gmail, Slack, Notion, GitHub, and 95 more." / "Ask Littlebird about your emails, meetings, files, and tasks — all in one place." / **"Toggle access per chat. You decide what Littlebird can see, always."** | "Set up integrations" → opens the **Add integrations** modal |

### Onboarding patterns worth stealing

- **"Other names you go by"** as a first-class onboarding field — explicit aliases capture. We currently rely on coreMemoryService to back-infer this.
- **Permission narrative**: each permission gets its own screen with a one-line trust statement. Accessibility = "Text only. No screen recording." Microphone = "Audio is processed securely and only during meetings."
- **The 3-minute live demo (step 8)** is the standout move. The user is shown a literal countdown — *"Use your Mac normally"* — and the app silently observes. Then step 9 *"Here's what Littlebird picked up"* delivers a 2-paragraph personalized summary. We don't have anything equivalent.
- **"Skip for now"** is universally available next to every permission. Reduces drop-off.
- **OAuth already done in the background**: by the time the user reaches step 5, Gmail and Google Calendar already show "Connected." Implies the Sign Up flow did Google OAuth and silently pre-wired the connections.

---

## 4. Main app surface — chat home

Layout (left → right):

### Left sidebar (~240px)

```
🐦 Littlebird

💬  New Chat              [active by default]
🔍  Search
📅  Meeting Notes      [Beta]
🔁  Routines

Projects                                +
📁  Greece Trips                              [example]

Recents
   Assistant Capabilities Overview

────────────────────────────────────
🎁  Get 2 Months Free                       [×]
[ Context enabled ●  ]                      [pill, green dot]
S   Stefano Gebara
    Basic
```

### Center

- Centered headline: **"What's on your mind today?"** (large serif)
- Composer block (card, ~700px wide, white background, ~20px radius):
  - Placeholder: "Ask Littlebird"
  - Bottom-left: `+` (attach menu) — popover shows: **Attach a file · Project ▸ · Max** *(For deep research and complex queries)* · **Create Image** *(toggle)* · **Manage integrations**
  - Bottom-right: row of small app icons (connected integrations), mic, **dark send arrow** (filled, circular)
  - Footer-inside-card: "Connect your apps to get better answers" + row of app logos + × dismiss
- Suggestion chips (4 visible, two rows):
  - "Can you help research something on the web?"
  - "How are you different from typical chatbots?"
  - "Get most important news in all continents"
  - "More suggestions"
- Bottom system banner: "🎁 Gift 2 months free — Earn $40 in credit when they subscribe — Copy Invite" — sits floating, dismissible

### Right (no permanent panel)

- Right side is empty by default in the chat home; populates only when a chat is active.

### Composer details

- The mode picker isn't surfaced as a model dropdown the way ChatGPT/Claude does it. Instead, "Max" is hidden inside the `+` menu as a per-message intensifier. Smart.
- "Create Image" is a **mode toggle**, not a separate command. Toggle it ON and the next message generates an image.
- "Project ▸" inside `+` lets you scope the chat to a project (Greece Trips, etc.) so the answer is constrained to that project's memory.

---

## 5. Feature areas

### 5.1 Chat

- Each chat = a session, listed in **Recents**.
- Two persistent personalization layers from Chat settings (see §6.7):
  - **Custom Instructions** — your system-prompt-like instructions (max length unknown).
  - **Assistant Notes** — *"Review and edit what Littlebird has remembered from past chats to guide future conversations"* — single freeform textarea. This is their version of TwinMe's structured directives table, just as a markdown blob.
- Tabs at the top: each chat is a tab; **Cmd+T new tab**, **Cmd+W close**, **Cmd+1..9 switch** — full browser-style tab UX.

### 5.2 Meeting Notes (Beta)

- Index page: `Meetings` heading, `+ New Note` CTA, search bar, **Coming up** (auto-populated from connected Calendar — empty state shows a calendar icon and "No upcoming events"), **Today** group with list rows showing icon · title · "Me" (owner) · "Add to project ▾" dropdown · `...` overflow menu.
- Each note has three views as tabs at the top of the document:
  - **Note** — Notion-style empty doc, *"Write, '/' for commands"* — slash-command editor.
  - **Summary** — AI-generated structured summary. Example saw "Minimal Snapshot" heading with 3 bullets including a verbatim quote *"Stefano Gebara: 'Hello. So I would like to speak about quantum physics.'"*
  - **Transcript** — speaker-labeled bubbles, right-aligned for self. Mic-source picker top-left: "🎙 System Default ▾"
- Recording controls float at the bottom-center: collapse arrow `⌃`, then **Stop ◼** / **Resume ▶**.
- Page header (top-right): date (e.g. "May 27"), copy link, share, chat, `...` overflow.
- "Add to project" dropdown lets you file the meeting note under a Project, or "Create project."

### 5.3 Routines (the scheduled-brief feature)

- Index page: "Routines" heading, `+ New routine` CTA. Grid of card tiles:
  - **+ Create Custom Routine** — empty template
  - **Morning Brief** — "A quick read on what matters today so you start the day knowing where to put your attention." (Daily at 7:00)
  - **End of Day Wrap-Up** — "A short end-of-day read: what got done, what's still open, and what tomorrow looks like." (Daily at 17:00)
  - **Weekly Reflection** — "Look back at the week: where your time went, what moved forward, and where to point your focus next." (Weekly on Monday at 6:00)
  - **Monthly Review** — "Zoom out on the last month and set intentions for the next one." (Monthly on the 1st at 7:00)
- Configure-routine modal (created from a template):
  - **Name** input
  - **Schedule** tabs: Daily / Weekly / Monthly + time picker
  - **Notifications** toggle ("Push when a new report is ready.")
  - **Email** toggle ("Email me when a new report is ready.")
  - **Instructions** textarea (right column) — prefilled with a friendly first-person prompt: *"Give me my morning brief. What's on today — top priorities, meetings I should prep for, and anything I'm at risk of dropping or letting slip through the cracks. Keep it to what I'd actually want to read before my first coffee."* — Mic icon for voice dictation
  - Footer: Cancel / **Create routine** (dark CTA)

### 5.4 Projects

- Projects = top-level grouping containers in the left sidebar with `+` to add.
- Chats, meeting notes, and (presumably) routine outputs can be "Added to project" via dropdowns/menus.
- "Greece Trips" is the example project shown.

### 5.5 Search

- Sidebar entry — Cmd+K. (Contents not captured in the screenshots.)

### 5.6 Hummingbird (the global shortcut + floating widget)

- Activated by **tapping Option twice** (default — user-configurable).
- Opens a floating chat overlay anywhere on the desktop.
- Three modes demonstrated in the settings preview tabs:
  - **Any app** — overlay reads whatever's on screen; e.g. reading an article + popup "Summarize this article about creativity" → returns **Key Takeaways** card.
  - **Ongoing meeting** — overlay attached to a live meeting; e.g. "what is going on?" → "Based on your current screen, you're discussing the distillation phase of memory..."
  - **Selected text** — select text in any app, invoke Hummingbird, ask a question scoped to the selection.
- Settings include: Enable toggle · Global Shortcut picker.

---

## 6. Settings — 12-section deep dive

The Settings modal opens as a centered overlay with a left nav (~200px wide) and a right content panel. Footer of the left nav always shows `Littlebird v0.78.22`. Sections in order:

### 6.1 General

| Field | Notes |
|---|---|
| What should Littlebird call you? | Text input. |
| Aliases | Text input, placeholder *"e.g. Rob, Robby, robert2025"* + helper *"Include your nicknames, online handles, and other identifiers, separated by commas."* |
| Timezone | Read-only display *"Littlebird has your timezone as Horário Padrão de Brasília. Detected from your devices."* + **Open system date & time settings** button |
| Use this device to determine timezone | Toggle ON (blue) |
| Email | Read-only with edit pencil icon |
| Version banner | "Littlebird v0.78.22 (Stable) · You are on the latest version · Channel: Stable" |
| Sign Out | Subtle gray button |

### 6.2 System

| Setting | Default | Type |
|---|---|---|
| Launch Littlebird on startup | ON | toggle |
| Notifications | ON | toggle |
| Notification Sound | ON | toggle |
| Time Format | 24-hour | dropdown (12 / 24) |
| Show App In | Dock and Status Bar | dropdown (Dock only / Status bar only / Dock and Status Bar) |

### 6.3 Appearance

- **Color Mode**: three visual radio cards each rendering a tiny app preview — Light · Dark · **Match System (selected)**. Real mini-screenshot per option — gorgeous touch.
- **Extra Wide Chat** — toggle (default OFF). "Choose whether to make the chat extra wide."
- **Font Size** — dropdown (Normal / others).
- **Code Block Wrapping** — toggle (ON). Sensible default for chat with code.

### 6.4 Privacy Controls

- Heading: "Control what Littlebird can see. Excluded content won't appear in your context. **Learn more ↗**"
- Two tabs at the top: **Exclude Apps (1)** / **Exclude Websites (17)**.
- **Exclude Apps tab**:
  - Search input ("Search applications...") + Filter dropdown
  - List of installed apps with per-row toggle (active OFF = excluded). Example shown: Finder excluded.
  - Footer: *"Can't find your app? Select it manually"*
- **Exclude Websites tab**:
  - Section *"Exclude by Category"* with toggles:
    - Adult Content (ON — *"Adult websites and mature content"*)
    - Banking & Finance (ON — *"Bank accounts, financial transactions, and investment platforms"*)
    - Health & Medical (OFF — *"Medical records, health information, and healthcare providers"*)
    - Social Media (OFF — *"Social media platforms and messaging services"*)
    - Shopping (OFF — *"E-commerce sites and online shopping platforms"*)
    - Entertainment (OFF — *"Streaming services, games, and entertainment platforms"*)
  - Section *"Exclude Specific Websites (15)"* — collapsed. Input "Add domain (example.com)" + Add button.

### 6.5 Data Controls

Granular delete controls, all under heading *"Manage Context Collected"*:

| Action | Helper text | Button |
|---|---|---|
| Delete Last Hour of Context | Remove all context collected in the last hour | Delete |
| Delete Last Day of Context | Remove all context collected in the last 24 hours | Delete |
| Delete Context for Custom Time Period | Choose a custom time period to remove context (e.g., last 2 hours, last 3 days) | Select |
| Delete All Context | **Permanently remove all context collected. This action cannot be undone.** | Delete |

Then *"Manage your Account"*:
- **Delete Your Account** — Permanently delete your account and all associated data — Delete

### 6.6 Hummingbird

- Heading: "Chat with anything on your screen — apps, meetings, or selected text."
- **See in action ▼** expandable section with 3 demo tabs: Any app · Ongoing meeting · Selected text — each renders a realistic preview.
- **Enable Hummingbird** toggle.
- **Global Shortcut** — dropdown set to "Tap Option twice"; clickable shortcut-recorder is hinted.

### 6.7 Meetings

Long settings list, two implicit groups:

**Meeting capture / behavior:**
| Setting | Default | Type |
|---|---|---|
| Meeting Notifications | Confirmed Only | dropdown |
| Meeting Language | English | dropdown (≥10 langs per docs) |
| Preferred Microphone | System Default | dropdown |
| Meeting Reminders | ON | toggle |
| Reminder Time | 1 Minute | dropdown |
| Exclude Events Without Guests | ON | toggle — *"Don't show notifications for events without other guests or meeting links"* |
| Meeting App Detection Alerts | ON | toggle — *"Show notifications when a meeting app is detected"* |
| Auto-Start Recording on Detection | OFF | toggle |
| Auto-Stop Inactivity Timeout | 15 Minutes | dropdown |
| Hide Widget From Screen Sharing | ON | toggle — *"Keep the floating meeting widget invisible to screen capture and shared screens"* |

**Menu bar:**
| Setting | Default | Type |
|---|---|---|
| Menu bar calendar | ON | toggle |
| Include events | Today & Tomorrow | dropdown |
| Preview upcoming event in menu bar | 3 hours before event | dropdown |

### 6.8 Chat

| Field | Notes |
|---|---|
| **Custom Instructions** | "Personalize your interactions with Littlebird by providing your own instructions." Large textarea with Discard / Save footer that activates when dirty. *"No unsaved changes"* indicator. |
| **Assistant Notes** | "Review and edit what Littlebird has remembered from past chats to guide future conversations." Large textarea. *"Edit Littlebird's memory"* placeholder. |

### 6.9 Integrations

- Heading: "Your Integrations" + **+ Add integration** CTA.
- Each connected integration is a card with:
  - Icon · name (e.g. Gmail) · settings cog · expand chevron · short description
  - Account row(s): email · email · **Connected** badge · edit · settings icons
  - "+ Add another account" link
- **Add integrations** modal: search · filter (All ▾) · **+ Add custom [$ Plus]** CTA · 2-col grid of integration tiles. Each tile has icon · name · "Connect [$ Plus]" or settings cog if already connected · description. Seen tiles:
  - Apple Calendar [$ Plus]
  - Apple Reminders [$ Plus]
  - Gmail (free, already connected)
  - Google Calendar (free, already connected)
  - Google Drive [$ Plus]
  - Outlook [$ Plus]
  - AdsInsight [$ Plus] — pharma/clinical-trial data
  - Ahrefs [$ Plus] — SEO/search analytics
- Per Littlebird marketing copy: "Gmail, Slack, Notion, GitHub, and **95 more**." The free vs Plus split is per-integration.

### 6.10 Keyboard Shortcuts

| Group | Action | Shortcut |
|---|---|---|
| General | New chat | Cmd+N |
|  | Search | Cmd+K |
|  | Open settings | Cmd+, |
|  | Toggle sidebar | Cmd+S |
| Navigation | Go back | Cmd+[ |
|  | Go forward | Cmd+] |
| Tabs | New tab | Cmd+T |
|  | Close tab | Cmd+W |
|  | Previous tab | Cmd+Shift+[ |
|  | Next tab | Cmd+Shift+] |
|  | Switch to tab | Cmd+1 ... Cmd+9 |

The tab system is a clear signal that Littlebird positions itself as a *browser-of-AI-chats*, not a single-chat sidekick.

### 6.11 Subscription

**Plus — $17/mo annual** (or ~$20/mo monthly; "-15%" badge for annual). Includes everything in Basic, plus:
- Advanced intelligence in chat
- Enhanced memory and personalization
- Additional daily chats
- Additional active routines
- Unlimited meeting notes
- Access to integrations for complex tasks and deep research
- Access to standard image generation
- Priority support
- **Start 14-day free trial** CTA

**Pro — From $100/mo**. Includes everything in Plus, plus:
- Choose 5x or 12x more usage than Plus
- Auto-detect language in meeting notes
- Higher limits for image generation
- Access to premium image generation
- Early access to new features
- Two CTAs: **Choose Pro 5x — $100/mo** · **Choose Pro 12x — $200/mo**

Below the table:
- **Referral code** input + Apply
- Green banner: "🌱 Earn $40 credits for each friend who subscribes — Start Referring"
- Footer link: "Want Littlebird for your team or business? Contact us ↗"

### 6.12 Team / Support

Visible in sidebar but content not captured. Team is presumably workspace/multi-user; Support is help center links.

---

## 7. Backend signals (inferred + verified)

| Signal | Source | Inference |
|---|---|---|
| Polling cadence | Help docs | ~2-second scrape of accessibility tree |
| Storage | Help docs + Built In | "Private encrypted index" on AWS, SOC 2 |
| Per-message model selection | Composer `+` menu | Single tier by default, "Max" mode for deep research, "Create Image" toggle |
| Tab system | Keyboard Shortcuts | Stateful tab manager — implies per-tab conversation state in memory + persistence |
| Recording state | Meeting Notes view | Background audio capture independent of chat tab focus |
| Calendar polling | Menu bar calendar setting | Pull-based polling against connected Google Calendar |
| Notification system | Settings → System | Native macOS notification center hooks |
| Update channel | General settings footer | Stable / (presumably Beta) channels — Sparkle-style autoupdater? |
| Image generation | Composer + subscription page | Backend has image-gen pipeline, with Plus = standard, Pro = "premium" |
| Account-linked memory | Chat settings | Server-side memory store ("Assistant Notes") synced across devices/tabs |
| Companion apps | Marketing | iOS + Android apps imply a sync server and remote-fetch path for memory |

What we don't know:
- The exact LLM provider(s) — not disclosed. "Advanced intelligence in chat" on Plus and "premium image generation" on Pro hint at multiple models behind one product surface (probably routed server-side).
- Whether they use Electron, Tauri, or a true native Swift/AppKit build. The OS-permission flows (Accessibility, Microphone) work for any of those, but the file-size limits, the visual polish, and the speed claims suggest native or Tauri-native rather than Electron.
- Whether context collection runs entirely on-device (most likely) and only chat-time queries hit the cloud — or whether snippets are streamed up continuously.

---

## 8. UI primitives catalogue

For visual reference if we want to mimic any of this in TwinMe:

| Primitive | Where it appears |
|---|---|
| Cream/off-white surface (`~#F7F4ED`) | Welcome, all onboarding panels, main app |
| Dark forest illustration | Welcome bg, right panels on onboarding |
| Tile preview card with realistic content | Every onboarding right panel |
| Pill toggle (blue) | All settings toggles |
| Tab strip with rounded inactive + filled active | Meeting Notes (Note/Summary/Transcript), Privacy Controls (Apps/Websites) |
| Suggestion chip (rounded full pill, neutral bg) | Chat home |
| Mode-radio card with mini app preview | Appearance → Color Mode |
| Status pill (green dot + label) | Sidebar "Context enabled ●" |
| Beta lavender pill | "Meeting Notes [Beta]" sidebar entry |
| Connected mint-green pill | Integrations card account rows |
| `$ Plus` paywall badge | Integration tiles, "Add custom" CTA |
| Floating recording controls | Meeting Notes |
| Skeleton + countdown progress | "Learning in progress... 03:01" |
| Auto-detect + override toggle | Timezone, language |
| Inline edit + Save/Discard footer | Custom Instructions textarea |
| Bottom-floating referral banner | Chat home |
| Modal w/ left nav + right content | All Settings views |
| Painted floating logos scene | "Connect everything. Ask anything." transition modal |

---

## 9. Strengths vs gaps (vs TwinMe today)

### Where Littlebird is ahead

1. **The 3-minute live observation demo** (step 8). It's the strongest first-impression mechanic I've seen — passive observation + a personalized summary. TwinMe's equivalent moment is a Soul Signature reveal that depends on having a Spotify or YouTube connected, which is a much bigger commitment.
2. **Per-message access toggles**: *"Toggle access per chat. You decide what Littlebird can see, always."* — a strong privacy guarantee that doesn't require global settings changes.
3. **Granular data-delete controls** (last hour / day / custom / all). Our "Delete Account" is binary.
4. **Category-based website exclusions** (Adult / Finance / Health / Social / Shopping / Entertainment toggles). Easier than building an exclude list manually.
5. **Tab-based chat browser model** (Cmd+T to spawn parallel chats). TwinMe's single-thread chat surface is more limited.
6. **Routines as first-class scheduled briefings**, user-configurable from cards. Our cron jobs (`cron-morning-briefing`, `cron-evening-recap`, etc.) already do this but aren't exposed.
7. **Meeting Notes as a complete sub-product** (Note + Summary + Transcript views, recording controls, auto-categorize into Projects).
8. **Hummingbird global shortcut** (⌥⌥ to open floating chat anywhere with screen context). Closest analog: Granola or Cluely. We have nothing equivalent.
9. **"Other names you go by" / Aliases** captured at signup, not back-inferred.
10. **Auto-detected timezone with device-source toggle**. We hardcode UTC.
11. **Single textarea "Assistant Notes" memory editor** — radically simpler than our directives table. Worth considering as an alternative UI affordance.
12. **Custom Instructions per-account** — system-prompt-level personalization that persists across all chats.
13. **Pricing referral mechanic** — $40/friend credit. We have no referral system.
14. **Visual onboarding right-panel previews** showing real outputs (briefing cards, "follow up with Jason" draft, integration logos). We use skeletons or empty states.

### Where TwinMe is ahead

1. **Soul Signature framing** ("from resume to soul") is more emotionally resonant than "AI that knows what you're working on."
2. **Memory stream + Generative Agents reflection engine** — Littlebird's "Assistant Notes" is one freeform textarea; we have observation → reflection → expert personas → wiki compilation. Genuinely deeper.
3. **Cross-platform**: web + (in-progress) mobile. Littlebird is Mac-only at launch.
4. **STDP synaptic plasticity + co-citation memory links** — neurally-inspired memory architecture. No competitor matches this.
5. **Smart-routed multi-model gateway** — chat-light / chat-standard / chat-deep based on query complexity. Littlebird hides model choice; we route to save cost at scale.
6. **Open data exports + portability** (Pluggy bank statements, GDPR-style import). Littlebird doesn't talk about import at all.

### Where they're roughly tied

- Calendar/Gmail integrations
- Custom Instructions (we have the persona block / core memory blocks; they have a textarea)
- Notifications + reminders
- Privacy/security claims (SOC 2 for both)

---

## 10. Direct action items for TwinMe (prioritized)

| Priority | Action | Effort | Where in code |
|---|---|---|---|
| **HIGH** | Add a "3-minute live observe" moment in onboarding using the existing browser extension as the data source. Closing screen: "Here's what we picked up" with 2 paragraphs (Activity Summary + Productivity Insights). | 2-3 days | `src/pages/onboarding/LiveObserve.tsx` (new) + browser extension hook |
| **HIGH** | "Other names you go by" / Aliases field in onboarding → push into `coreMemoryService` blocks | 2 hours | `coreMemoryService.js`, onboarding form |
| **HIGH** | Granular data-delete controls (last hour / day / custom / all) on PrivacySpectrumDashboard | 1 day | `src/pages/PrivacyPage.tsx` + new `/api/user/delete-context` endpoint |
| **HIGH** | Auto-detected timezone (replace hardcoded UTC) | 2 hours | `twinSystemPromptBuilder.js` + frontend (Intl.DateTimeFormat().resolvedOptions().timeZone) |
| **MED** | Routines UI surfacing existing crons (Morning Brief / Evening Wrap-Up / Weekly Reflection / Monthly Review) as user-configurable cards | 1-2 days | new `src/pages/RoutinesPage.tsx` + read existing cron config |
| **MED** | Custom routine builder: name + schedule + instructions textarea | 1 day | new route + new `user_routines` table or extend `proactive_insights` |
| **MED** | Per-chat access toggles ("toggle access per chat") | 2 days | new `twin_conversations.scope_overrides` JSONB column + UI |
| **MED** | Category-based website exclusions (Adult / Finance / Health / Social / Shopping / Entertainment) for browser-extension data | 1 day | new `user_excluded_categories` + filter in observation pipeline |
| **MED** | Single freeform "Assistant Notes" memory editor as an alternative view alongside our structured directives table | 1 day | new `/twin-soul/notes` route, reuses `twin_directives` with a "single-blob" mode |
| **MED** | Tab-style chat browser (Cmd+T new chat, Cmd+1..9 switch) | 2-3 days | new TabContext + TalkToTwinPage refactor |
| **LOW** | Suggestion chips on `/talk-to-twin` — replace generic with concrete: "Help me research X" / "Get me up to speed on the news" / "How are you different from X" | 1 hour | copy edit |
| **LOW** | Referral mechanic ($X per friend who subscribes) | 2-3 days | new tables + UI |
| **LOW** | Mode-radio cards (Light / Dark / Match System) with mini app previews | 1 day | dark mode already shipped — add system-match + previews |
| **LOW** | Global hotkey (Mac/Windows) opening a Hummingbird-style floating chat that reads selected text or current browser tab | 3-5 days | requires native shell (Tauri/Electron) — not aligned with web-first today |

---

## 11. Notable phrases worth stealing verbatim

- "Text only. No screen recording. You control which apps to include and can delete data anytime."
- "Audio is processed securely and only during meetings. You stay in control."
- "Toggle access per chat. You decide what Littlebird can see, always."
- "Excluded content won't appear in your context."
- "Permanently remove all context collected. This action cannot be undone."
- "Get smarter the more you use it."
- Daily-rhythm framing: "Morning Brief / End of Day Wrap-Up / Weekly Reflection / Monthly Review" — exactly how we should label our cron jobs in the UI.
- "Give me my morning brief. What's on today — top priorities, meetings I should prep for, and anything I'm at risk of dropping or letting slip through the cracks. Keep it to what I'd actually want to read before my first coffee." — could be the default instruction string for our Morning Brief routine template.

---

## 12. Open questions worth answering before copying

1. Is their context collection really only on-device, or do they stream snippets up? (Important for our cost model — we cannot afford per-2-second LLM calls.)
2. Do their Routines run on-device or server-side? (Our cron-based model is server-side. Their model would need a daemon or a server-job.)
3. Pricing: is $17/mo Plus enough to cover their compute, given they presumably pay for OpenAI/Anthropic? We're burning ~$0.50/user/day on heavy users; that's hard at $17/mo unless they aggressively rate-limit.
4. Their "Pro 5x / Pro 12x" pricing is essentially a usage multiplier — similar to ChatGPT Plus vs Team vs Enterprise. Worth modeling for our pricing.
5. The "95 more integrations" claim — do these route through a third party (Pipedream / Composio / Paragon) or are they all bespoke? Composio looks likely given the variety (AdsInsight, Ahrefs).


---

## Part 2 — jo (askjo.ai)


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
