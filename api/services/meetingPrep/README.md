# Meeting Prep Agent

> "Your twin shows up before you do. For every meeting."

The Meeting Prep Agent is TwinMe's answer to Renan's "credit card" framing — a
twin that does real work for you around your calendar: it **prepares** you
before a meeting, **debriefs** you after, and **drafts the follow-up** so you
only have to hit send.

It is built on the Generative Agents memory stream: briefings are grounded in
the user's real calendar plus their memory stream, not generic templates.

---

## The four phases

| Phase | Trigger | What happens | Surface |
|-------|---------|--------------|---------|
| **1. Pre-brief** | `cron-meeting-prep` (*/30 min) or the `/scan` button | Reads the next 26h of calendar events, researches attendees + pulls the user's relevant memories, LLM generates a structured briefing | `/meetings` page, dashboard `NextMeetingCard`, `get_meeting_prep` chat tool |
| **2. Post-debrief** | `cron-meeting-debrief` (*/30 min) | For meetings that ended 25–180 min ago, the twin generates a "what likely happened" read: action items, follow-ups, relationship notes | `DebriefSection` on the `/meetings` card |
| **3. Agentic follow-up** | User clicks "Recap por e-mail" | LLM drafts a recap email from the debrief and saves it as a **Gmail draft** (never sends — the user keeps the irreversible step) | Recap preview on the `/meetings` card |
| **4. Surfacing** | Continuous | Briefings appear on the dashboard, the `/meetings` page, and answer chat questions like "what's my prep for tomorrow?" | Dashboard, `/meetings`, twin chat |

---

## Data model

### `meeting_briefings` table

```
id            uuid PK
user_id       uuid → public.users(id)
event_id      text          -- Google Calendar event id (UNIQUE with user_id)
event_etag    text          -- idempotency: skip re-brief if etag unchanged
headline      text
briefing_json jsonb         -- the full briefing payload (see below)
generated_at  timestamptz
```

Migration: `database/supabase/migrations/20260418_meeting_prep.sql`

### `briefing_json` shape

```jsonc
{
  "headline": "1-line meeting-in-a-nutshell",
  "attendees": [
    { "name", "company", "title", "whoTheyAre", "lastTouchpoint" }
  ],
  "companyContext": "key org info",
  "talkingPoints": ["actionable point", ...],
  "watchOuts": ["something to be careful about", ...],
  "myContext": "what the user brings to this meeting",

  // Added by cron-meeting-debrief once the meeting has ended:
  "debrief": {
    "summary": "the twin's read of what happened",
    "likelyCovered": [...],
    "probableActionItems": [{ "owner": "me" | "<name>", "task" }],
    "followUpsRecommended": [...],
    "relationshipNotes": [{ "person", "note" }],
    "generatedAt": "iso"
  },

  // Calendar metadata — lets the read API render without re-hitting Google:
  "_meta": {
    "summary", "startTime", "endTime", "location",
    "hangoutLink", "meetingUrl",
    "attendees": [{ "email", "name", "responseStatus", "organizer" }]
  }
}
```

`_meta` is **stripped** before the briefing payload is sent to the frontend —
it's surfaced as top-level fields (`startTime`, `endTime`, `attendees`, …) on
the API response instead.

---

## Backend

### Services — `api/services/meetingPrep/`

| File | Responsibility |
|------|----------------|
| `meetingPrepService.js` | Orchestrator. `fetchUpcomingExternalEvents` (calendar scan, 0–26h, filtered by `shouldPrepEvent`), `generateBriefing` (cron path, idempotent on event+etag), `generateBriefingForChat` (on-demand), `listMeetingBriefingsForChat` (the `get_meeting_prep` read path), `buildUserContext` (richer memory retrieval for solo appointments) |
| `eventPrepFilter.js` | Pure skip rules (`shouldPrepEvent`): all-day/declined/generic blocks, attendee-less personal events unless title/description signals external stakes (pitch, interview, contract...), and NEVER agent-created events (tagged `extendedProperties.private.twinme_origin=agent` by `createEvent`). replan-2026-06-10 Track B. |
| `meetingDebriefService.js` | `generateDebrief`, `generateRecapEmail`, `findDebriefCandidates` (meetings ended 25–180 min ago without a debrief) |
| `briefingPromptBuilder.js` | Builds the LLM prompt; branches for solo appointments (tells the LLM not to invent attendees) |
| `attendeeResearcher.js` | `getEmailHistory` (Gmail), merges email history + memories into `pastInteractions` |

### Routes

| Route | Purpose |
|-------|---------|
| `GET /api/meeting-briefings` | Reads briefings, buckets into `inProgress` / `upcoming` / `recent` / `undated`. Flags `hasDebrief` and `debriefPending` (ended ≤3h ago, no debrief yet). |
| `POST /api/meeting-briefings/scan` | On-demand calendar scan + brief. Capped at `MAX_SCAN_BRIEFINGS` (8) so a packed calendar can't blow past the HTTP timeout — overflow is reported as `deferred` and left for the cron. |
| `POST /api/meeting-briefings/:id/recap` | Phase-3 action: LLM drafts a recap email from the debrief, saves a Gmail **draft**. Ownership-checked. Returns the text even if Gmail isn't connected (partial success with a `note`). |
| `GET /api/cron/meeting-prep` | Cron — runs `fetchUpcomingExternalEvents` + `generateBriefing` per event. */30 min. |
| `GET /api/cron/meeting-debrief` | Cron — runs `findDebriefCandidates` + `generateDebrief`. */30 min. |

### Bucketing rules (`GET /`)

- **inProgress** — `startTime <= now < endTime`. A live meeting is *not* "recent".
- **upcoming** — `startTime > now`.
- **recent** — already ended. `debriefPending: true` when it ended ≤180 min ago
  with no debrief (the debrief cron will pick it up shortly — this closes the
  gap where the user would otherwise see a stale prep card with no signal).
- **undated** — legacy rows with no `_meta.startTime`.

---

## Chat integration

Two tools, registered in `api/services/tools/extendedTools.js`:

- **`get_meeting_prep`** — reads already-generated briefings. For broad
  questions: "what meetings do I have?", "am I ready for this week?". Fast, no
  regeneration. Returns `inProgress` + `upcoming` (or `recent` / `all`).
- **`meeting_prep`** — generates a *fresh* deep briefing for ONE specific named
  meeting. For "prep me for my call with X".

Both render a `WorkspaceActionCard` in chat (CalendarCheck icon). `get_meeting_prep`
uses the list renderer (`MeetingItem`); `meeting_prep` surfaces the headline.

**Important:** meeting briefings are **excluded** from the proactive-insights
chat-context injection (`getUndeliveredInsights` filters out the `meeting_prep`
category). Briefings are reference data, not "huh, interesting" observations —
they reach the twin through the tool, on demand, with a visible action card.
Leaking the headline into "THINGS I NOTICED" previously let the twin fake a
shallow answer instead of calling the tool.

---

## Frontend

- **`/meetings`** — `src/pages/MeetingsPage.tsx`. Sections render in priority
  order: **Acontecendo agora** (in-progress, emerald variant + join button) →
  **Próxima** (hero, amber) → **Em breve** → **Últimas** → **Sem horário**.
  Cards show a "Debrief a caminho" pill when `debriefPending`, an honest hint
  when a briefing is minimal, and "Hoje" / "Amanhã" relative day labels.
- **`NextMeetingCard`** — `src/pages/components/dashboard-v2/NextMeetingCard.tsx`.
  Self-hiding dashboard card for the most imminent meeting within 24h.
- **API client** — `src/services/api/meetingBriefingsAPI.ts`.

---

## Tests

| File | Kind | Run |
|------|------|-----|
| `tests/e2e/meetings-page-comprehensive.spec.ts` | Mocked, all states (B/F/E/U/X/C standards) | `TWINME_RUN_MEETINGS_AUDIT=true` — also wired into `scripts/audit-all.mjs` |
| `tests/e2e/meetings-live-scan.spec.ts` | Live — drives `/scan` against the real calendar | `TWINME_RUN_MEETINGS_LIVE=true` |
| `tests/e2e/chat-meeting-prep-tool.spec.ts` | Live — `get_meeting_prep` chat tool | `TWINME_RUN_CHAT_TOOL_TEST=true` |
| `scripts/verify-meeting-recap.mjs` | Live — seeds a debrief'd briefing, verifies the real recap endpoint, cleans up | `node scripts/verify-meeting-recap.mjs` |
| `scripts/diag-calendar.mjs` | Diagnostic — can the agent read the test user's calendar? | `node scripts/diag-calendar.mjs` |

---

## Cost notes

- Both crons run at **\*/30 min** — not more frequent (Vercel GB-hour rules).
- `generateBriefing` is idempotent on `event_id + event_etag`: re-running the
  cron or spamming `/scan` is cheap (skips already-briefed events).
- `/scan` is capped at 8 briefings per call — the rest fall to the cron.
- Briefings use `TIER_ANALYSIS` (DeepSeek) with a `TIER_CHAT` (Claude) fallback
  only if DeepSeek times out.
