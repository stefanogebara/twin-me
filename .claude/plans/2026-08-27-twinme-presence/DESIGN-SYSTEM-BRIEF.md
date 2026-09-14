# Presence design-system brief

## Company name and blurb

Presence is a two-sided AI family communication product for older adults and the people who love them. An older adult gets an unhurried voice conversation with a clearly identified AI presence shaped by a real family member's voice, memories, language, and relationship style. The family member receives a concise, grounded summary and can send a verified reply or question in seconds. Presence reduces loneliness without pretending the AI is a live phone call or allowing it to make promises on a person's behalf.

## Design purpose

The interface must feel calm, dignified, emotionally warm, and technologically precise. It should communicate that Presence is a real product with clear states and safeguards, not a speculative AI lifestyle concept. The product serves two different attention patterns: long, patient voice interaction for an older adult and fast, high-signal review for a busy family member.

## Visual constraints

- Base visual language: editorial restraint inspired by Cognition, with product evidence replacing generic feature cards.
- Marketing fields: warm paper, fogged Monsoon blue, charcoal, and a restrained warm orange-red signal gradient.
- Typography: Manrope for interface language; Newsreader for memories, quoted speech, and emotional narrative.
- Use one-pixel adaptive borders and a disciplined 8px spacing grid.
- Use uppercase micro-labels sparingly for state, provenance, and metadata.
- Product demonstrations occupy the full viewport (`100svh`) and communicate one behavior per chapter.
- Shared controls and typography must remain consistent, but chapters must not repeat the same composition.
- Human imagery stays blurred, in motion, or atmospheric. The product interface remains sharp.
- Glass is reserved for interactive surfaces. Do not place every message inside a floating glass card.
- Primary action targets are at least 42px and use short 120–180ms state transitions.
- All motion respects `prefers-reduced-motion` and nothing decorative loops indefinitely.

## Product chapters

1. Listen — a full-screen voice instrument with one unmistakable listening state and visible AI identity.
2. Preserve — a specific memory shown in the speaker's own words, directly over an atmospheric human field.
3. Relay — one family decision separated from the long conversation, with a verified reply controlled by the real family member.

## Trust constraints

- The AI is always identified as AI.
- Consent, identity, and provenance remain visible.
- Visits, money, medicine, and promises require verified family input.
- Do not imply that a cloned voice is a live call from the family member.
- Do not use clinical dementia imagery, infantilizing language, fake testimonials, or generic claims about companionship.

## Remove by default

- Nested cards that do not correspond to a real product boundary.
- Repeated centered-card compositions.
- Decorative icons, dividers, badges, copy, or glow that do not clarify state or action.
- Photorealistic hands and faces as the primary focal point.
- Navy SaaS dashboards, neon AI gradients, and purple-to-pink washes.
- Generic feature-card grids.

## Frontend resources

- `src/pages/PresenceLandingPage.tsx` — current marketing prototype and product-state copy.
- `src/styles/presence-marketing.css` — current Presence-specific tokens and responsive layouts.
- `src/pages/PresencePage.tsx` — authenticated product prototype.
- `public/images/presence/presence-motion-field-v1.png` — blurred human-presence field.
- `public/images/presence/presence-relay-glow-v1.png` — warm relay signal background.
- `.claude/plans/2026-08-27-twinme-presence/README.md` — product thesis, safety model, research, and implementation record.

## Notes for design generation

Consider the entire page before changing a local component. Explore multiple structural solutions, remove unnecessary elements, then judge the result using realistic Presence content in a browser preview. Avoid prototype gravity: a new direction may replace an existing section rather than decorate it. The result should feel like one coherent product system, not a patchwork of individually polished components.
