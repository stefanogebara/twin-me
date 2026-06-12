---
name: soul-signature-design
description: TwinMe (Soul Signature) frontend design rules — dark-only Claura system, glass surfaces, anti-generic-AI-design guidance. Use when building or reviewing any TwinMe UI.
user-invocable: false
---

# Soul Signature Design

> "Perhaps we are searching in the branches for what we only find in the roots." - Rami

TwinMe's design captures authentic personality, not generic AI personas.

## Source of truth

The authoritative token spec lives in `twin-ai-learn/CLAUDE.md` ("Design System
(Dark Mode — Claura)") and `src/index.css`. This skill is the philosophy +
anti-pattern layer; never restate token values here — they drift (a previous
version of this skill described a light ivory theme long after the product
went dark, and actively sabotaged design work).

## The system in one breath

Dark-only. `#13121a` night-sky base with four sun-driven ambient gradient orbs
(amber/copper + one purple accent). Every card/panel is dark glass:
`rgba(255,255,255,0.06)` fill, `blur(42px)`, `rgba(255,255,255,0.10)` border.
Primary CTA is a light pill — `#F5F5F4` background, `#110f0f` text,
`rounded-[100px]`. Sidebar is FLAT (no rounded pill edges). ThemeContext is
hard-locked dark; there is no light mode.

## Typography

- `Instrument Serif` — hero/display/auth titles and narrative voice only.
  Always negative letter-spacing.
- `Geist`/`Inter` — ALL UI text (body, labels, buttons, nav). 500 is the
  base body weight. (A previous version of this skill said "avoid Inter" —
  that's the OLD light theme talking; ignore any such instinct.)

## Hard rules

- NO EMOJIS anywhere in user-facing UI. Icons are lucide-react.
- NEVER navy blue, never neon, never flat white/opaque cards on app surfaces.
- English copy only.
- Suggestion chips `rounded-[46px]`; floating navbar `rounded-[32px]` pill;
  active sidebar nav = full pill fill, never an underline or left border.

## Anti-slop (what makes it NOT look AI-generated)

- Specific beats generic: real data, real numbers, the user's actual words —
  never lorem, never fake testimonials, never "[Your insight here]".
- Restraint: one accent moment per view. If everything glows, nothing does.
- No purple-to-pink gradient washes, no bouncing entrances, no spinning
  3D blobs, no glassmorphism-on-everything (glass is for surfaces, not text).
- Empty states say what's true and what to do next — never decorative filler.

## Motion

- Micro-interactions < 200ms (`cubic-bezier(0.4, 0, 0.2, 1)`); content
  reveals 200-300ms; page transitions 300-500ms.
- Subtle hover lift (translateY(-2px) + soft shadow) over scale/bounce.
- Nothing auto-plays or loops indefinitely; respect prefers-reduced-motion.

## Review checklist (when judging a screen)

1. Does it read as the night-sky glass system, or did a flat/light/navy
   surface sneak in?
2. Is the hierarchy carried by Instrument Serif (display) vs Geist (UI), with
   negative tracking on headings?
3. Could any visible string have come from a template? Replace with the
   user's real data or cut it.
4. Are CTAs the light pill, chips 46px, navbar 32px, sidebar flat?
