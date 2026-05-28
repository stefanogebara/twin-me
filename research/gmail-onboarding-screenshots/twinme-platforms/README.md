# Littlebird — Deep Product Analysis

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
