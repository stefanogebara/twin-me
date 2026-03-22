# Feature: Soul Signature Page Redesign
**Date:** 2026-03-22
**Status:** Draft

## Problem
The Soul Signature (/identity) page is a wall of text that no beta user will engage with. OCEAN scores shown twice (redundant), 5 expert personas dump paragraphs of similar content, zero visual hierarchy, zero interactivity. The Memory Explorer (/brain) is a raw database view with no value for normal users.

## Success Criteria
- [ ] User spends >30s on page (vs current ~5s bounce)
- [ ] First-time users get a cinematic reveal moment
- [ ] Returning users see what CHANGED this week (living portrait)
- [ ] Page is shareable — users screenshot it for friends
- [ ] Memory Explorer removed from main nav (Settings > Advanced)
- [ ] Zero walls of text — every insight is 1 sentence with expandable detail

## Scope
**In:** Complete Soul Signature redesign, archetype system, OCEAN radar chart, 1-sentence expert insights with expand, "This Week" drift highlights, first-time reveal, on-demand "ask about yourself" prompts, Memory Explorer nav demotion
**Out:** New API endpoints, new DB tables, sharing infra (exists), Memory Explorer redesign

## Page Structure

```
[Archetype Hero]
  "The Architect" + tagline + animated orb

[OCEAN Radar Chart]
  5-axis animated radar + shift indicators

[Trait Badges]
  6-8 glass pills: "Night Owl", "Deep Worker", "Music as Medicine"

[Expert Insights x5]
  Icon + 1 killer sentence + expand chevron per domain

[This Week]
  Drift % + 2-3 bullets of what changed

[Ask Your Twin About You]
  Suggestion pills -> navigate to /talk-to-twin
```

## Archetype Engine
Maps OCEAN to ~12 archetypes:
- High O + High C + Low E -> "The Architect"
- High O + Low C + High E -> "The Spark"
- Low O + High C + High A -> "The Anchor"
- High O + High N + Low E -> "The Poet"
Each has: name, tagline, emoji, description

## First-Time Reveal
- Full-screen dark overlay
- SoulOrb breathing (3s)
- Archetype name word-by-word fade
- Radar animates 0 -> actual
- Badges pop in
- localStorage flag prevents re-show

## Technical
- Reuse: /api/twin/identity, /api/personality-profile, /api/personality-profile/drift
- Recharts RadarChart, Framer Motion (both installed)
- No new packages, no backend changes

## Estimated Complexity: L (2-3 sessions)
