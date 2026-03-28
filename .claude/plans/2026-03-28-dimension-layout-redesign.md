# Soul Signature → Dimension-Style Layout Redesign

**Date**: 2026-03-28
**Status**: SPEC READY — not started
**Inspiration**: Dimension.dev dashboard (explored live via Playwright, screenshots saved)

---

## What Dimension Does (from live exploration)

### Layout
- **Split panel**: Left = main content area (60%), Right = contextual sidebar (40%)
- Sidebar has icon tabs at top (checkmark/envelope/calendar) to switch context
- Main area has personalized greeting + chat input
- "Morning Briefing" button at bottom-right of sidebar as persistent CTA

### Visual Language
- **Rich gradient background** — blue-to-purple atmospheric, not flat black
- **Frosted glass panels** floating on the gradient — blur 50-60px, barely-visible borders
- **Inner glow** on card edges (top-edge light catch)
- **No hard borders** — shape defined by blur differential, not lines
- Cards have `box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.15)`
- Integration badges as colorful icon row
- Weather + location as personalization signal

### Typography
- Large serif for display/hero text
- Clean sans-serif for body
- Very muted secondary text (0.35 opacity)
- Personalized greeting: "Good Afternoon, Stefano" with date

### Interaction
- Hover lift on cards (translate-y -2px)
- Smooth transitions between panel states
- Icon tabs switch sidebar content without page navigation

---

## TwinMe Adaptation Plan

### New Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│  Sidebar │                                               │
│  (nav)   │  ┌─────────────────────┬──────────────────┐  │
│          │  │                     │                    │  │
│          │  │   MAIN PANEL        │   CONTEXT PANEL   │  │
│          │  │   (60%)             │   (40%)           │  │
│          │  │                     │                    │  │
│          │  │   Hero: Architect   │   ┌─ Soul Score ─┐│  │
│          │  │   + tagline         │   │  69 ring     ││  │
│          │  │                     │   └──────────────┘│  │
│          │  │   Identity Quote    │                    │  │
│          │  │                     │   ┌─ 6 Cards ────┐│  │
│          │  │   Personality DNA   │   │ Music  Body  ││  │
│          │  │   (5 OCEAN sliders) │   │ Social Focus ││  │
│          │  │                     │   │ Curio  Drive ││  │
│          │  │   Values            │   └──────────────┘│  │
│          │  │   Rhythms           │                    │  │
│          │  │   Taste             │   ┌─ Insights ───┐│  │
│          │  │   Connections       │   │ Listening DNA ││  │
│          │  │                     │   │ Energy Rhythm ││  │
│          │  │   ICA Axes          │   │ Twin Accuracy ││  │
│          │  │                     │   └──────────────┘│  │
│          │  │                     │                    │  │
│          │  │   Ask Twin          │   [☑] [✉] [📅]   │  │
│          │  │                     │   Icon tabs        │  │
│          │  └─────────────────────┴──────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Left Panel (Main — scrollable)
1. **Personalized greeting**: "Good Evening, Stefano" + date (Instrument Serif)
2. **Archetype hero** (compact — no full-screen overlay, just name + tagline + trait badges)
3. **Identity Quote** (weekly one-liner)
4. **Personality DNA** (5 OCEAN sliders)
5. **Values** section
6. **Rhythms** section
7. **Taste** section
8. **Connections** section
9. **ICA Personality Axes** (12 expandable)
10. **Ask Twin** prompts

### Right Panel (Sidebar — sticky/fixed)
1. **Soul Score ring** (69) at top
2. **6 Contributor Cards** (2x3 grid, compact)
3. **Icon tabs**: Soul (default) / Insights / Activity
   - Soul tab: contributor cards + score
   - Insights tab: swipeable insight cards stacked vertically
   - Activity tab: recent memories / correlations
4. **"Chat with Twin" CTA** at bottom (persistent)

### Background
- Warm amber atmospheric gradient (our brand, not Dimension's blue)
- Brighter than current: orb opacity 50-60%
- Both panels float on the gradient as frosted glass

### Responsive
- Desktop: split panel (60/40)
- Tablet: full-width with sidebar as collapsible drawer
- Mobile: single column (current layout, but with gradient bg)

---

## Technical Implementation

### Files to Create
- `src/layouts/SplitPanelLayout.tsx` — new layout wrapper with main + sidebar
- `src/pages/components/identity/ContextSidebar.tsx` — right sidebar component
- `src/pages/components/identity/SidebarTabs.tsx` — icon tab switcher

### Files to Modify
- `src/pages/IdentityPage.tsx` — restructure to use SplitPanelLayout
- `src/pages/components/identity/SoulScore.tsx` — compact version for sidebar
- `src/pages/components/identity/InsightCards.tsx` — vertical stack version for sidebar
- `src/index.css` — add gradient background tokens for identity page

### Files to Keep As-Is
- PersonalityDNA.tsx, PersonalityAxes.tsx, IdentityQuote.tsx — just move to main panel
- All backend code — no changes needed

### Key CSS
```css
/* Split panel layout */
.split-panel {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 24px;
  min-height: 100vh;
}

/* Frosted glass panel */
.glass-panel {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(56px);
  -webkit-backdrop-filter: blur(56px);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 24px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.2);
}

/* Warm gradient background */
.identity-bg {
  background: linear-gradient(135deg,
    rgba(30,25,20,1) 0%,
    rgba(45,30,20,1) 30%,
    rgba(25,20,35,1) 70%,
    rgba(20,18,28,1) 100%
  );
}

/* Sidebar sticky */
.context-sidebar {
  position: sticky;
  top: 80px;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
}
```

---

## Design Decisions (already confirmed with user)
- Keep warm amber tones (not Dimension's blue — our brand is soul/warmth)
- Qualitative labels on contributor cards (Deep/Growing/New, not numbers)
- Locked cards show "Connect X to unlock"
- OCEAN sliders with TwinMe-flavored labels
- Weekly cached identity quote
- ICA axes with expand/collapse
- 56px backdrop blur, inner glow shadows, hover lift effects
