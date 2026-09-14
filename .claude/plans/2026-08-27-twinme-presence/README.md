# TwinMe Presence

Status: product thesis defined, competitor research completed, interactive prototype built, and the first persisted product route implemented. Real provider-backed voice cloning remains gated on backend consent and identity verification.

Last updated: 2026-08-27

## Product implementation status

The first complete entry journey now exists:

- `/presence` is the public hero and product explanation.
- `/presence/login` is the Presence-specific sign-in surface backed by TwinMe's existing Google OAuth flow.
- `/presence/onboarding` is authenticated and preserves the intended destination through login.
- Relationship fields, tone selection, and onboarding progress persist locally under the versioned `twinme-presence-draft-v1` key.
- Browser voice capture remains local. Provider-backed cloning is not exposed until backend identity verification, consent evidence, deletion, and audit controls are implemented.

The next implementation slice is the authenticated family dashboard: Presence status, recent conversations, summaries, verified replies, voice-fidelity settings, and consent management.

### Visual direction update

Presence now uses the Monsoon Connection art direction: `#305282`, `#98AFC7`, and `#E9ECEF`; large fields of fogged colour; and human figures treated as long-exposure atmosphere rather than literal lifestyle photography. The public hero contains one blurred elderly fingertip (`public/images/presence/presence-finger-hero-v2.png`). The product exhibition uses a purpose-built motion field (`public/images/presence/presence-motion-field-v1.png`) behind three sharp, code-native interface states: live listening, a preserved memory, and the verified family relay. The earlier photographic summary macro was rejected and is no longer used by the page. Functional pages reuse the palette as blurred atmosphere rather than repeating the hero photograph behind forms.

The marketing sequence follows a product-camera rhythm: abstract brand promise, brief real-life context, then a Cognition-like dark exhibition where translucent screens show actual product states. The visual focus stays on parts of the interface, while people and hands remain out of focus and in motion. Every panel carries one claim and one visible product behavior; generic feature cards are not used as substitutes for the product itself.

The landing page uses four coordinated fields rather than unrelated section treatments: warm paper for orientation and the primary relay demo, fogged Monsoon blue for the human context, charcoal for product evidence, and warm paper again for consent and trust. Across all four fields, the system holds one-pixel adaptive borders, 16–20px surface radii, a 12-column desktop grid, uppercase micro-labels, Manrope for interface language, and Newsreader only for memories and narrative speech. This is the Presence interpretation of Cognition's observed editorial restraint and evidence-first product presentation, not a literal brand copy.

### Marketing design constraints

Following Matt Dailey's “How I Design with AI” guidance, landing-page feedback is evaluated against the whole system instead of handled as isolated spot fixes. Current constraints:

- Product demonstrations are full-screen chapters (`100svh`), not cards arranged in a grid.
- Each chapter communicates one behavior only: listen, preserve, or relay.
- Chapters share type, border, label, and control primitives, but must not repeat the same composition.
- No nested presentation card unless the product itself requires a bounded interactive surface.
- Remove decorative copy, dividers, icons, or glow that does not clarify state or action.
- Prototype with real product language and verify at the live route before accepting a direction.

## Resume here

TwinMe Presence is a two-sided, asynchronous family communication layer for older adults and the people who love them.

An older adult gets an unhurried voice conversation with a clearly identified AI presence shaped by a real family member's voice, memories, language, and relationship style. The family member receives a concise summary and can send a verified reply or question in seconds. That real input enters the next conversation.

Core product principle:

> The AI carries affection and context. It does not replace or impersonate the person.

Primary positioning:

> A long conversation for her. A small, real reply from you.

The core insight is asymmetric conversational time: an older adult may want to speak slowly for 30–40 minutes while a child or grandchild may only have one minute to understand and ten seconds to respond. Presence compresses time without compressing affection.

## Work completed

- Researched ageing, loneliness, dementia communication, digital interventions, consent, voice-cloning risk, and relevant regulation.
- Benchmarked ElliQ, Delphi, StoryFile, Remento, HereAfter-adjacent products, ElevenLabs, Cartesia, and Resemble.
- Defined the thesis, differentiation, MVP, ethical boundaries, pilot metrics, and kill criteria.
- Mapped the concept to existing TwinMe memory, Soul Signature, voice, interview, and summary infrastructure.
- Built and browser-tested a complete interactive frontend prototype.
- Verified TypeScript, targeted lint, and the production build.

## Prototype

Development URL:

```text
http://127.0.0.1:8086/preview/presence
```

Files:

- `src/pages/preview/PresencePrototype.tsx`
- `src/styles/presence-system.css`
- Dev-only route registration in `src/App.tsx`

The prototype contains five stages:

1. Start: value proposition and recurring AI disclosure.
2. Bond: relationship, names, tone, and shared language.
3. Voice: consent, real local microphone recording and playback, sample prompts, and a simulated fidelity result.
4. Style: progressive interview about warmth, humor, private language, and boundaries.
5. Relay: older-adult conversation, family summary, verified family reply, and provenance.

The microphone capture is real and local. “Build first voice” is a UI simulation. It does not upload audio or create an external clone yet.

## Presence design system

Status: implemented and applied to the interactive prototype on 2026-08-27.

Design-system URL:

```text
http://127.0.0.1:8086/preview/presence-system
```

Files:

- `src/pages/preview/PresenceDesignSystem.tsx`
- `src/styles/presence-system.css`
- Shared by `src/pages/preview/PresencePrototype.tsx`

### Direction

The Presence visual system is intentionally separate from Claura. It removes photography, ambient gradients, glass surfaces, decorative shadows, pill buttons, large radii, and Instrument Serif from the Presence experience.

The structural reference is Cognition's editorial website and the outlined product surfaces used by Devin:

- Warm near-white canvas.
- Visible multi-column grid.
- Fixed structural navigation rail.
- Hairline section divisions.
- Flat cards treated as regions rather than floating objects.
- Rectangular controls with very small radii.
- Grotesque display typography paired with editorial serif narrative text.
- One electric system-state accent.

The result is not a direct copy. Presence adds a warmer paper tone, a separate coral voice signal, a moss grounded-memory signal, relationship-specific copy, and provenance as a first-class visual primitive.

### Principles

1. Structure is reassurance. Rules, columns, labels, and attribution make the system understandable.
2. Warmth lives in language. Familiar names, voice, and remembered details carry emotion; the UI remains restrained.
3. Signals mean one thing. Blue is system state, coral is active voice, moss is grounded memory.
4. Cards are regions, not floating objects. Default elevation is zero.
5. The origin of a sentence is part of its design.

### Foundation tokens

| Token | Value | Purpose |
| --- | --- | --- |
| Paper | `#F2F0EB` | Primary canvas |
| Paper raised | `#F8F7F3` | Cards and inputs |
| Mineral | `#161714` | Primary ink |
| Graphite | `#666761` | Secondary text |
| Rule | `#D4D2CB` | Default border and grid |
| Rule strong | `#A6A59F` | Selected/verified structural border |
| Signal blue | `#2F35FF` | Navigation and system state |
| Voice coral | `#D75D45` | Recording/listening/speaking only |
| Memory moss | `#66745D` | Grounded memory and evidence |

Typography:

- `Manrope`: display, navigation, controls, labels, and operational text.
- `Newsreader`: memory, direct speech, relationship narrative, and reflective copy.
- Display: 64px/0.95 with approximately -5.5% tracking.
- Page title: 36px/1.05 with approximately -4% tracking.
- Narrative: 22px/1.25.
- Body: 15px/1.5.
- Label: 11px uppercase with 0.11em tracking.

Geometry:

- Spacing scale: `4, 8, 12, 16, 24, 32, 48, 64, 96`.
- Default border: 1px.
- Major cards: 24px radius with restrained layered elevation.
- Nested fields and reply surfaces: 16px radius.
- Buttons and explicit controls: 10px radius.
- Status and selection chips: full pill.
- People, voice, and icon actions: circular.
- Nested shapes use concentric geometry: inner radius equals the outer radius minus its surrounding padding.
- Transition duration: 150–240ms.

### Voice and provenance states

- Idle voice uses neutral rules.
- Active recording/listening uses Voice Coral and never decorative animation elsewhere.
- System-ready state uses Signal Blue.
- Grounded evidence uses Memory Moss.
- Family-verified, older-adult-direct, grounded-memory, AI-bridge, and system-safety statements must remain visually distinguishable.

### Reference audit

Measured from the live Cognition site during the design audit:

- Canvas approximately `#F7F6F5`.
- 1px vertical grid lines and strong sectional gutters.
- Navigation is flat and left-aligned.
- Primary headings use a compact grotesque at 36px/39.6px with -0.72px tracking.
- Narrative body uses a serif at 15px/22.5px.
- Active navigation uses electric blue.
- Most controls have no radius; the outlined Devin button uses a strict rectangular treatment.

These measurements informed the design grammar, not copied assets, source code, proprietary fonts, or brand content.

## Honest verdict

The idea is promising enough for serious validation, but it is not yet proven to be a billion-dollar company.

| Dimension | Initial assessment |
| --- | --- |
| Problem severity | Very high |
| Emotional pull | Exceptional |
| Prototype feasibility | High |
| Differentiation | Good, not absolute |
| Distribution and willingness to pay | Unproven |
| Safety and regulatory complexity | Very high |
| Overall pre-validation potential | Strong |

The prototype is relatively easy. The company is difficult. Trust, consent, identity rights, hallucinated commitments, family participation, retention, and safe use with cognitive impairment are the hard parts.

## Evidence and market context

- WHO projects roughly 2.1 billion people aged 60 or older by 2050.
- Loneliness and social isolation are important later-life mental-health risk factors.
- Meaningful social and intergenerational activity can improve wellbeing and quality of life.
- Evidence for digital interventions reducing loneliness remains mixed. Presence must not claim to cure loneliness, treat dementia, or prevent cognitive decline without clinical evidence.

Sources:

- WHO, Mental health of older adults: https://www.who.int/news-room/fact-sheets/detail/mental-health-of-older-adults
- WHO, Social isolation and loneliness: https://www.who.int/health-topics/ageing/reducing-social-isolation-and-loneliness-among-older-people
- WHO evidence synthesis: https://iris.who.int/bitstream/handle/10665/381746/9789240112360-eng.pdf
- NIA, loneliness and dementia-risk association: https://www.nia.nih.gov/news/loneliness-linked-dementia-risk-large-scale-analysis
- WHO, digital health and dementia care: https://www.who.int/europe/news/item/06-11-2025-telemedicine-shows-promise-in-improving-dementia-care--who-study-finds

## Competitive landscape

- ElliQ: proactive generic AI companion for adults 60+, caregiver app, communication, reminders, and optional wellness sharing.
- HereAfter, StoryFile, and Remento: guided stories, recorded voice, conversational retrieval, memory preservation, or legacy artifacts.
- Delphi: digital mind trained from content, guided interviews, style, and a short voice sample.
- ElevenLabs, Cartesia, and Resemble: voice-cloning and realtime voice infrastructure.

Presence combines those categories through a relay between two living people:

```text
Long older-adult conversation
        ↓
Short family summary
        ↓
Verified family reply or question
        ↓
Next conversation incorporates real input
        ↓
Shared memory and future human contact
```

The moat cannot be the idea alone. It must come from trusted relationship data, provenance, longitudinal memory, interaction design, safety, and real family retention.

## Onboarding benchmark

| Product | Observed model | Lesson for Presence |
| --- | --- | --- |
| ElliQ | 5–10 minutes to activate, then an onboarding conversation of about 10 minutes. | Fast activation and guided voice onboarding. |
| Delphi | First Digital Mind in roughly 15 minutes with a 10-second voice sample. Deeper interview sprint: 60–90 minutes. | Deliver an early result, then offer depth. |
| StoryFile Life | 10–20 responses in 10–30 minutes; up to 500 questions over several days. | A useful minimum must not require complete life capture. |
| Remento | One prompt per week by email/text; no app or password for the storyteller; recordings up to 30 minutes. | Progressive capture with almost no recurring friction. |
| ElevenLabs Instant | Roughly 1–2 minutes of clean audio. | Appropriate for the first-value experience. |
| ElevenLabs Professional | At least 30 minutes, ideally 2–3 hours; commonly 3–6 hours to train. | High fidelity is a later upgrade. |
| Cartesia Instant | Roughly 5 seconds in similarity mode or 10–20 seconds in stability mode. | Strong instant-clone and latency benchmark. |
| Cartesia Pro | At least 30 minutes, recommends about 2 hours, roughly 3 hours to train. | Include in provider bake-off. |
| Resemble Rapid | Roughly 10 seconds–3 minutes, under one minute of training. | Include as a rapid-clone challenger. |

Primary sources:

- ElliQ: https://elliq.com/pages/faqs
- Delphi overview: https://embed.delphi.ai/about
- Delphi Interviewer: https://docs.delphi.ai/build/delphi-interview/the-delphi-interview
- Delphi Interview Sprint: https://docs.delphi.ai/playbooks/build-your-delphi/interview-sprint-zero-to-one-content
- StoryFile: https://life.storyfile.com/support
- Remento: https://help.remento.co/en/articles/8365873-what-is-remento-and-how-does-it-work
- ElevenLabs cloning: https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning
- ElevenLabs latency: https://elevenlabs.io/docs/eleven-api/concepts/latency
- Cartesia instant: https://docs.cartesia.ai/2024-06-10/api-reference/voices/clone
- Cartesia professional: https://docs.cartesia.ai/build-with-cartesia/capability-guides/clone-voices-pro
- Resemble: https://docs.resemble.ai/voice-creation/voices/clone-overview

## Onboarding decision

Do not require a multi-hour interview before first value. Use progressive onboarding.

### First Presence

Target: 10–15 minutes.

- Explain the product and repeat that the listener will speak with AI, not a live call.
- Capture consent and verify the voice owner.
- Define the relationship, names, and natural tone.
- Record roughly two minutes of varied, clean speech.
- Create an instant voice clone.
- Ask three high-signal relationship questions.
- Let the family member hear and correct a first response.
- Invite the older adult into a controlled first conversation.

### Relationship depth

Target: 5–10 minute blocks over subsequent days.

- Nicknames, private language, humor, and teasing.
- Favorite shared memories and photo anchors.
- Emotional support style.
- Topics to avoid.
- How the family member handles repeated stories.
- What the Presence may ask autonomously.
- What always requires a verified instruction.

### True Voice

Collect only explicitly approved, clean samples. When enough material exists, offer a professional-clone upgrade.

- `First Presence`: approximately two minutes of audio, instant clone, immediate first conversation.
- `True Voice`: 30–60+ minutes of approved audio, professional clone, stronger consistency and emotional range.

Never silently repurpose private family calls as training data.

## Voice strategy

Start with ElevenLabs because TwinMe already contains:

- `@elevenlabs/client` and `@elevenlabs/react`
- `src/hooks/useVoiceInterview.ts`
- `api/services/voiceService.js`
- `api/routes/voice.js`
- Existing conversational-agent webhook routes
- Clone, synthesis, voice-profile, and deletion paths

The existing clone endpoint is authenticated and professor-gated. Do not directly expose it to this consumer flow. Presence needs its own consent, authorization, identity-verification, retention, and deletion model.

ElevenLabs documents about 75 ms of model inference for short Flash inputs, not end-to-end latency. Perceived latency also includes network, end-of-turn detection, transcription, LLM time, text chunking, TTS first audio, and buffering. Instant clones generally synthesize faster than professional clones.

### Provider bake-off

Build a blind Brazilian-Portuguese comparison across ElevenLabs, Cartesia, and at least one challenger.

Measure:

- Speaker similarity rated by the voice owner and close family.
- Naturalness rated by listeners unfamiliar with the provider.
- Brazilian Portuguese pronunciation.
- Names, nicknames, locations, and food terms.
- Emotional range without instability.
- Consistency over 20+ minutes.
- End-to-end time to first audible response.
- Interruption and barge-in recovery.
- Slow speech and long-pause tolerance.
- Comprehension with common older-adult hearing loss.
- Cost per 40-minute conversation.
- Comfort versus uncanny effect.

Raw similarity is not enough. A technically accurate voice that feels uncanny is a product failure.

## Relationship interview

The interview teaches a particular relationship, not a generic personality.

Essential first questions:

1. Who is this Presence for, and what do they call you?
2. How do you naturally sound together: affectionate, teasing, practical, reflective, or mixed?
3. Which names and phrases belong only to this relationship?
4. Tell one shared memory that reliably makes both of you happy.
5. When they repeat a story, how do you normally respond?
6. What should the Presence encourage them to tell you?
7. Which subjects are delicate or forbidden?
8. What must never be promised without your direct instruction?
9. When should the Presence ask you to call or visit?
10. What would make this feel unlike you?

## Experience model

### Older-adult side

- Voice-first, with one obvious action or wake phrase.
- Large targets and very few choices.
- Long response tolerance and patient turn-taking.
- Short prompts, one question at a time.
- Rephrasing instead of repeating identical questions.
- Real photos, recorded greetings, and approved memories as grounding.
- Clear recurring AI disclosure.
- No infantilizing language or baby voice.

Example disclosure:

> I am Stefano's AI presence. He taught me some of your stories and asked me to listen. He will receive a short note after we talk.

### Family side

After a long conversation, deliver:

- Three concise facts or stories.
- One optional audio highlight.
- One “needs reply” item.
- Tentative affect language, never diagnosis.
- Visibility into what the older adult agreed to share.
- A ten-second text or voice reply.

## Provenance and promise locks

Every meaningful utterance should have provenance:

- `family_verified`: written or recorded directly by the family member.
- `older_adult_direct`: spoken directly by the older adult.
- `memory_grounded`: paraphrase grounded in an approved memory.
- `ai_bridge`: generated conversational language.
- `system_safety`: required disclosure or safety language.

The AI may elaborate warmth and conversational transitions. It may never invent:

- Visits or schedules.
- Gifts or purchases.
- Financial instructions.
- Medical advice.
- Legal decisions.
- Family news.
- Claims that a family member is listening live.
- Claims that it remembers an ungrounded event.

## Ethical and safety boundaries

### Dementia

Do not begin the commercial pilot with moderate or advanced dementia. Start with cognitively healthy older adults, mild age-related memory difficulty, or mild cognitive impairment under appropriate professional guidance.

If a person cannot retain the distinction between an AI presence and a live person, the experience becomes materially different. It should move into a supervised memory activity, not an autonomous relational companion.

Communication guidance: https://www.nia.nih.gov/health/alzheimers-changes-behavior-and-communication/communicating-someone-who-has-alzheimers

### Voice and identity

- Explicit voice-owner consent.
- Identity and liveness verification before production cloning.
- Clear synthetic-voice disclosure.
- Easy revocation, export, and deletion.
- No public voice-library sharing.
- No exportable clone by default.
- Signed, expiring realtime access.
- Audit log for generated audio and requesting user.

Sources:

- FTC voice-cloning harms: https://www.ftc.gov/policy/advocacy-research/tech-at-ftc/2023/11/preventing-harms-ai-enabled-voice-cloning
- ANPD technical note: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/documentos-tecnicos-orientativos/sei_anpd-0140555-nota-tecnica.pdf
- EU AI Act: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1689

Hard blocks:

- Money, passwords, banking, purchases, and transfers.
- Medical diagnosis, treatment, or medication changes.
- Legal commitments.
- Secrecy requests.
- Unverified emergencies.
- Attempts to conceal that the voice is synthetic.

Pain, falls, suicidal language, abuse, wandering, missed medication, or acute confusion must route to a configured human workflow. Presence is not an emergency service.

## MVP

Include:

- Two-sided relationship and participant roles.
- Voice-owner consent and identity verification.
- Instant clone and realtime conversation with interruptions.
- Progressive relationship interview.
- Approved memories and photos.
- Daily or event-based summary.
- Family voice/text reply.
- Provenance and promise locks.
- Revocation, export, deletion, safety routing, and audit logs.

Exclude initially:

- Moderate/advanced dementia positioning.
- Medical monitoring claims.
- Medication management or financial actions.
- Video/face cloning.
- Public Presence sharing.
- Unsupervised emergency-detection claims.
- Training from arbitrary private calls.

## Pilot

- 10–15 families.
- 4–6 weeks.
- One older adult and one primary family participant.
- Protocol reviewed with a gerontologist, occupational therapist, or dementia specialist.
- Wizard-of-Oz support where automation is not yet trustworthy.

Success measures:

- Older adult voluntarily starts at least three sessions per week.
- Family reads at least 70% of summaries.
- Family replies at least three times per week.
- Family burden remains under five minutes per day.
- Human calls and visits increase or remain stable.
- Older adult can identify the Presence as AI rather than a live call.
- New meaningful stories and accurate commitments are captured.
- Summary and attribution correction rate remains low.

Kill or redesign criteria:

- Repeated belief that the AI is a live family member despite disclosure.
- Human contact declines.
- Family stops replying while the avatar continues indefinitely.
- Summaries cause privacy harm or family conflict.
- Fabricated promises or facts cannot be driven close to zero.
- Older adult participation is involuntary.

## Architecture direction

Presence should begin as a TwinMe vertical or experiment, not a separate company before validation.

Reuse:

- Memory stream and retrieval.
- Soul Signature and personality profile.
- Stylometric fingerprint.
- Twin chat context pipeline.
- ElevenLabs realtime voice hook.
- Voice clone and synthesis service.
- Summary/proactive insight infrastructure.
- Life-story capture.

New capabilities:

- Relationship entity linking voice owner, older adult, and authorized family.
- Relational permission and consent ledger.
- Voice-sample provenance and retention policy.
- Family relay inbox/outbox.
- Statement provenance and promise locks.
- Older-adult interaction mode.
- Disclosure logs.
- Safety-event routing.
- Human-contact guardrail metrics.
- Provider-agnostic voice adapter and evaluation harness.

Possible future entities, pending explicit architecture review:

```text
presence_relationships
presence_participants
presence_consents
presence_voice_profiles
presence_voice_samples
presence_sessions
presence_session_summaries
presence_family_messages
presence_attributed_statements
presence_safety_events
presence_human_contact_logs
```

Do not create these tables before the product flow and consent model receive an architecture review.

## Next implementation phases

### Phase 1: Real voice spike

- Build a provider-agnostic evaluation route.
- Connect a consent-aware instant-clone endpoint to ElevenLabs.
- Preserve the existing professor route and its authorization boundary.
- Add verified voice ownership and deletion.
- Test Brazilian-Portuguese samples across providers.
- Measure end-to-end latency, similarity, and comfort.

### Phase 2: First conversation

- Create a Presence-specific realtime prompt and turn-taking policy.
- Reuse WebRTC interruption handling.
- Tune for slow speech and long pauses.
- Ground the conversation in three approved memories.
- Log disclosure and provenance.

### Phase 3: Relay

- Generate a three-item post-session summary.
- Add sharing controls for the older adult where appropriate.
- Extract one “needs reply” item.
- Accept a short family text or voice response.
- Inject only verified family content into the next conversation.

### Phase 4: Pilot tooling

- Consent dashboard.
- Session review and correction.
- Safety-event queue.
- Human-contact tracking.
- Export and deletion.
- Pilot analytics.

## Open questions

- Does a familiar cloned voice increase comfort or produce an uncanny effect over long conversations?
- Should the first version use a full clone or recorded openings/closings around a clearly synthetic conversational voice?
- How often should disclosure repeat without disrupting warmth?
- Who owns and corrects shared relational memories?
- What summary content should remain private to the older adult?
- What happens when family members disagree about facts or permissions?
- Who pays: adult child, senior living, home care, insurer, or employer benefit?
- Does Presence make people call more, or relieve enough guilt that they call less?
- What should happen when the family participant stops engaging?

## Names and language

Working names:

- TwinMe Presence
- Carta Viva
- Entre Nós
- Presença

Current recommendation: `TwinMe Presence`.

One-liners:

> A long conversation for her. A small, real reply from you.

> A voice bridge for families who love each other but live at different speeds.

> The AI carries the conversation. The relationship remains human.

Avoid positioning it as a virtual grandchild, dementia treatment, loneliness cure, replacement caregiver, or excuse not to call.

## Future-session handoff

Use this prompt:

```text
Resume the TwinMe Presence project from
.Codex/plans/2026-08-27-twinme-presence/README.md.

Read the entire document first, inspect the existing prototype at
/preview/presence, and continue from the first incomplete implementation phase.
Preserve consent, disclosure, provenance, promise locks, and human-contact
guardrails. Do not treat voice cloning as cosmetic personalization.
```
