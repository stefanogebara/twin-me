# TwinMe Money — next steps

**Working roadmap · 18 September 2026**

Goal: give roughly ten friends a useful, understandable Money beta without presenting guesses as financial facts. Build confidence in the numbers and corrections first; add more intelligence only when it improves a real decision.

This document is based on the completed [product audit](/Users/stefanogebara/.codex/artifacts/twinme-money-product-20260918/audit.md) and [verified release record](/Users/stefanogebara/.codex/artifacts/twinme-money-product-20260918/release-record.md). The shipped baseline is [PR #417](https://github.com/stefanogebara/twin-me/pull/417), merged as `6b806743`. This roadmap is a plan, not a claim that the remaining work has been implemented or re-tested since that release.

## Revision after the reconciliation review

**The first version missed a release blocker: preserved ledger rows are not proof of distinct payments.** The bank reference lifecycle can create duplicate economic transactions. Review, merge and verify [#419](https://github.com/stefanogebara/twin-me/pull/419) before Session 1 or further financial-model changes. #419 subsequently merged as `01ac9489` after review, an additional repeated-purchase fix and all six required checks. See the implementation log below for release status; the earlier review was of `0b950e64`.

Fable reports that the repair/rescore reduced widening from €121.38 to €50.19 and that 13 September's actual changed from €51.50 to €125.08 after settlement. The €50.19 widening and €125.08 September 13 score were subsequently independently read from production during implementation; the €121.38/€51.50 earlier values remain reported history. Narrower intervals after cleaning outcomes do not by themselves prove better prediction accuracy. Do not rerun a destructive repair merely because this plan lists it: first inspect the completed repair's evidence and remaining differences.

Two scoring defects are independently verified in the current code: daily figures become eligible the next day, and automatic scoring selects only never-scored records. The manual rescore script in #419 does not fix either ongoing behavior. These are early A4/A5 work, before Stage B; the implementation below is being verified. Spacing also returns to an unresolved design decision: the 40px override was technically checked, not validated against Instinct's authenticated workspace or the user's request for more room.

## 1. What is already done

| Area | Shipped behavior / technical checks | Still incomplete |
|---|---|---|
| Web spacing | 40px section spacing and 20px phone gutters shipped; CSS application was checked. | Design approval is unresolved: CLAUDE.md specifies 128px desktop / 96px phone. The inspected Instinct reference was sign-in, not its authenticated workspace. Resolve A6 before C2. |
| Home chat | Today opens the existing conversation with an editable draft; it does not send automatically. | Better suggestions driven by the user's actual situation; no need for a second chatbot. |
| Accounts and cards | Observed card references appear under bank accounts. Credit/debit can be explicitly labelled; unsupported type remains unknown. | Manual accounts, unknown banks, stronger card identity and credit-card repayment reconciliation. |
| Ledger identity | Existing amounts/dates were preserved in the previous release check. | That check missed duplicate economic payments. Reference changes remain a blocker until #419 is deployed and replay/live sync is verified. |
| Corrections | Rejected payments leave calculations; dissolved recurring series are removed. Confirmed actions refresh the current web app's cached financial views. | Atomic changes, reliable rebuilds, stored insights, other tabs and native-client synchronization. |
| Forecast fixes | Personal shares affect historical baselines; unrelated same-price payments no longer clear named bills. | Duplicate-contaminated outcomes, premature scoring and stale scores first; then weekly obligations, missing history, transfers, calendar double counting and validated quality. |
| Chat reliability | Interrupted streams are identified; history failures are visible; streamed completion waits for local history writes. A live reply and both saved turns were verified. | Atomic conversation persistence, duplicate-request handling, stronger claim grounding and general-twin memory consistency. |
| Calendar honesty | A generic multi-day assignment is no longer automatically treated as travel. | Recurring ICS events, reliable freshness and proof that calendar context improves predictions. |
| Validation | 5,379 tests passed, including 25 real-Postgres tests; 44 desktop/phone browser journeys passed. Release checks passed. | Native simulator/device tests, broader live-model evaluation and real user research. Passing software tests does not establish forecast accuracy. |

**Important:** the codebase still has an existing lint/type backlog. The release preserved the regression limits; it did not achieve zero errors. See the release record for test limitations and the live data comparison.

## 2. Product decisions to work toward

These are the recommended defaults. They do not require you to make technical architecture decisions.

- **Today:** the daily estimate, what it is based on, its freshness, the next meaningful obligation and Ask.
- **Month:** actual spending, categories, accounts and receipts, with correction and undo. Make Plan a view within Month rather than a separate top-level destination.
- **Ask:** one conversation that explains evidence and offers explicit changes. A message is not permission to silently rewrite financial records.
- **Settings and sources:** accounts, cards, imports, user-confirmed facts, optional calendar/location and deletion. This replaces the vague role of “You.”
- **Legacy personality/insight surfaces:** keep outside the main Money journey. Do not delete underlying code until references and any remaining users are checked.
- **Artwork:** keep recognizable merchant/bank marks and useful charts. Do not commission more decorative art now. Replace a complex chart only when the simpler version helps people compare or understand money better.
- **Banking:** keep the friend pilot statement-based until multi-user provider eligibility and the real connection flow are verified. Existing owner access is not evidence of permission to offer banking to friends.
- **Location and calendar:** optional. They must earn their place through useful outcomes; neither should be a prerequisite to understanding spending.

Navigation changes above remain planned unless listed as shipped in section 1.

## 3. The order of work

| Stage | Outcome | What it unlocks |
|---|---|---|
| 0 — stop and repair duplication | Verify #419, deployment and the existing repair; reconcile affected outcomes. | A trustworthy starting ledger. |
| A — establish financial truth | Reference examples, delayed score eligibility and correction-driven rescoring; resolve the spacing contract. | Safe changes to financial logic. |
| B — fix the core | Correct obligations, coverage, transfers, corrections, deletion and chat claims. | A supervised web pilot. |
| C — make it usable | Complete account organization, simplify navigation and verify the supported user journeys. | Expansion from two friends to ten. |
| D — prove the intelligence | Evaluate predictions and whether calendar/location actually help. | Stronger predictions and optional context features. |
| E — expand distribution | Verify native behavior and provider access for the intended audience. | Native rollout and, if permitted, friend bank connections. |

**Do not wait for every research idea before testing the basic product.** The first friend pilot can be a statement-based spending/review tool with uncertain predictions clearly withheld or labelled. Features with unresolved privacy, correctness or permission problems must be disabled or kept out of that pilot.

## 4. Implementation backlog

Effort is an estimate for focused engineering and verification, excluding provider response time and collecting future prediction outcomes. S: under two hours; M: about half a day; L: one to two days. Larger work is explicitly split. Technical implementation and test evidence are the engineering responsibility; Stefano's main roles are providing access when required and recruiting willing testers.

### Stage 0 — stop the feed from recreating the damage

| ID / priority | Work | Completion criteria | Effort / dependencies |
|---|---|---|---|
| R0 / blocker | **Review and release #419.** Inspect the complete PR, especially provider-reference aliases, per-batch matching, balance behavior and StrictMode loading. Reproduce pending → fallback → stable bank-reference transitions through persistence, not just pure fixtures. | Same payment remains one transaction across syncs/restarts; two legitimate equal-price purchases remain two; accounts/users never cross-match. Required checks pass on the reviewed head; deployed commit is recorded; a real subsequent sync creates no repeat copies. | M review/verification; fixes estimated separately. Before Session 1. |
| R1 / blocker | **Verify the existing repair and corrected outcomes.** Inspect the backup, dry-run/application record and remaining duplicate candidates. Check dependent references/facts and ambiguous groups before any further repair. Compare affected days and the derived band after repair. | Every merged group has evidence; ambiguous pairs remain untouched; replay is idempotent. Affected-day totals and score changes are recorded against the exact ledger revision. Confirm the reported rescore rather than applying it blindly again. | M; R0 and existing repair evidence. Data changes carry high risk and require rollback evidence. |

Green tests alone do not close R0. A clean static fixture can coexist with a feed that recreates duplicates every night. R1 includes verifying work already reported complete, not assuming it must be repeated.

### Stage A — before changing more financial logic

| ID / priority | Work | Completion criteria | Effort / dependencies |
|---|---|---|---|
| A1 / first | **Create a reference ledger.** Use synthetic bank, card and statement data with a frozen clock and exact expected answers. Cover ordinary purchases, weekly bills, two subscriptions at one merchant, splits, transfers, refunds and missing coverage. Include provider-reference changes across syncs, repeated imports and two legitimate identical-price purchases. | Today, Month, Plan and chat's computed claims agree at each dated checkpoint. A failing result identifies which financial rule disagrees. | M; R0/R1 verified before accepting the baseline. |
| A2 / first | **Set the beta's conservative defaults.** Review and disable cross-user statistical priors by default; keep optional sensitive context out of required onboarding; correct collection/removal promises that exceed actual behavior. | A fresh account has no cross-person learning enabled; skip paths work; every privacy promise maps to a verified operation. | M; no dependency. |
| A3 / first | **Define change and recovery checks.** Capture a fresh data baseline before each financial release, define which metadata can legitimately change during sync, and prepare rollback/rebuild procedures for schema changes. | Restore rehearsal succeeds before a migration; verification distinguishes new bank activity from an unintended edit; unresolved differences are reported, not silently accepted. | M; extend the existing release process. |
| A4 / critical | **Let daily outcomes settle before training.** Define score eligibility from the closed financial day and a shared, explicit four-day settling policy aligned with reconciliation. Keep earlier observations provisional and exclude them from learned widening. Require evidence of a successful, sufficiently complete source read; age alone is not coverage. | Frozen-clock tests cover Friday payments booked the next week, the eligibility boundary, timezone/day boundaries and a failed feed. No provisional day trains the band. Missing coverage is withheld; arrivals after four days remain correctable through A5. | M; A1, R0/R1. Coverage metadata integrates with B1. |
| A5 / critical | **Automatically revise outcomes when their evidence changes.** Record score input revisions; schedule bounded, retryable rescoring for affected dates when imports, settlement, deduplication or relevant user corrections alter the ledger/facts. Replay calibration chronologically. | Correcting an already-scored day updates actual/error/hit and the current band without a manual script. Repeated jobs make no additional change; date moves affect both dates; failures remain pending and visible. Original forecasts and intervals as issued stay immutable. | L; A4 and focused database tests. Deliver before full B4, then integrate with B4's broader revision mechanism. |
| A6 / design decision | **Resolve spacing before extending the redesign.** Compare the current 40px override with the documented 128px desktop / 96px phone register on real Money pages with identical content. Use authenticated Instinct workspace evidence if available; otherwise label the comparison as our own proposal. | The user's preference for more room is addressed, the chosen desktop/phone values are recorded, and the contract and implementation agree. Technical rendering and user/design acceptance are reported separately. | M; before C2. No spacing change in this document revision. |

Do not repeat the whole audit. Reproduce each failure, then fix it. Four days is a provisional settling allowance, not proof of finality: late postings and corrections can arrive later. Define the exact day-close/timezone boundary in A4 and test it; do not casually equate “four dates later” with four elapsed days after closure.

**Implementation sketches for the first three fixes:** R0 traces each provider identity transition through ingestion and persistence, including a later stable reference and a second real purchase with identical amount; inspect the repair separately from prevention. A4 introduces one named eligibility policy and a provisional outcome state, then uses that policy wherever daily outcomes feed calibration; withhold unsupported periods instead of teaching the model zero. A5 persists affected dates/revisions alongside the financial write where feasible, drains bounded jobs with retries, and replays the short calibration history from the earliest change (or its full bounded history). Keep original issued predictions separate from recomputed training state: a repair must never rewrite what the user originally saw to make past accuracy look better.

### Stage B — correctness and trust

| ID / priority | Work | Completion criteria | Effort / dependencies |
|---|---|---|---|
| B1 / critical | **Track observed coverage.** Store which account/date ranges are actually covered by an import or completed bank read. Unknown periods must not become zero spending. | Ten imported days never appear as 84 observed days. Partial imports, missing accounts and failed reads produce a clear limitation or abstention. | L; A1. |
| B2 / critical | **Model recurring occurrences.** Separate a merchant from its individual recurring series, then enumerate every expected charge in the remaining period. Add cancellation and expiry behavior. | A weekly bill can have multiple future charges after one charge has already arrived. Two subscriptions at one merchant remain separate. Missed charges do not create an immortal subscription. | L for occurrence model + L for exceptions; A1. |
| B3 / critical | **Separate expense from money movement.** Distinguish purchases, own-account transfers, card repayments, shared expenses, reimbursements and income. A person's relationship must not determine the purpose of every transfer. | Card purchases plus settlement are not counted twice; reimbursed money is not automatically income; rent paid to a flatmate remains a real personal expense. Ambiguous movements stay reviewable. | L for classification + L for matching/edge cases; A1 and stable account identity. |
| B4 / critical | **Make confirmed changes reliable.** Give each action an identity and each financial state a revision. Persist the action safely, then rebuild or invalidate dependent results. Add undo and visible recovery from failed rebuilds. | Repeated taps/retries apply once. A failed change never displays success. Every view shows the new revision or says it is updating; old results cannot silently overwrite it. | L for atomic actions + L for broader propagation; A1, integrate A5 rather than delaying it. |
| B5 / critical | **Make forgetting and deletion complete.** Link visible facts to hidden location records and copies in the general twin's memory. Specify what disconnect, delete-source, forget-fact and delete-account each mean. | A forgotten home/incorrect note is no longer retrievable from its derivatives. Tests verify ownership, retries and failures. Retention exceptions, if any, are explicit. | L for provenance + L for deletion/migration; A2, A3, B4. |
| B6 / critical | **Ground chat's financial claims.** Build monetary answers from server-computed objects containing the entity, period, currency and evidence IDs. Let the model explain them rather than invent calculations. | A correct amount attached to the wrong merchant/month is rejected. Partial data is disclosed. Receipts support the actual claim. “How it got there” shows evidence/calculations rather than treating model reasoning as proof. | L; A1, B4. |
| B7 / important | **Implement a real one-off correction.** Let the user mark a specific payment/event as exceptional, preview the effect, confirm it and undo it. Ask which payment when the reference is ambiguous. | The real expense stays in actual spending; only its appropriate baseline contribution changes. A generic remembered note is never presented as a forecast correction. | L; B2, B4 and B6. |
| B8 / important | **Finish conversation persistence.** Handle user/assistant turn pairs, request retries, interrupted saves and the non-streaming route consistently. Separate local conversation success from copying context to the general twin. | Reload preserves a completed exchange; retries do not duplicate it; a failed save is visible; account switches cannot retain another user's private content. | L; B4. |

**Small examples that must pass:**

- A €60 dinner split three ways is €60 of account outflow and €20 of personal expense; €40 received back is settlement, not new earned income.
- A €100 card purchase followed by its €100 card-bill payment remains €100 of expense when both sides are present. If purchase detail is missing, disclose that limitation.
- A €500 rent transfer to a flatmate does not disappear because that person is a friend.
- A real €300 one-off purchase remains in the month. Removing it from the recurring baseline does not remove the payment.
- A bill charged every week still has future occurrences after the first payment of the month.

These examples define behavior; they are not claims that all five work correctly today.

### Stage C — complete the everyday product

| ID / priority | Work | Completion criteria | Effort / dependencies |
|---|---|---|---|
| C1 / important | **Unify banks, accounts and cards.** Include manual statement accounts and banks outside the current fixed list. Use stable provider identifiers when available; keep suffixes scoped to their account. Replace full-ledger reads for inventory with a bounded, indexed query. | Two accounts at one bank remain separate; identical suffixes across accounts never merge; currencies and freshness are visible; unsupported card types stay unknown; large histories do not break account listing. | L; B3's identity contract. |
| C2 / important | **Simplify pages and copy.** Implement the navigation decisions in section 2. Make each important figure explain its basis and link to evidence. Prioritize legibility over decorative charts. | Friends can find a payment, understand the daily estimate and correct an interpretation without being told where to click. No dead links or contradictory labels across pages. | L; A6 first, then review with the first two testers before finalizing. |
| C3 / release gate | **Complete the web journey test matrix.** Exercise onboarding/import, account selection, corrected totals, chat, reload, outage/retry and deletion at desktop and phone widths. Include actual backend checks with isolated test users. | Zero known cross-user access failures, duplicate money movements or contradictory reference-ledger totals; keyboard and phone flows work. Fixture tests and live-backend tests are reported separately. | L; relevant Stage B work. |
| C4 / release gate | **Prepare the pilot and support path.** Write short setup/limitations instructions, an issue-report template and a release checklist. Record cost, source freshness and failed updates without logging unnecessary financial text. | A friend knows what is connected, what is estimated, how to correct it, how to remove data and how to report a wrong number. Cost/failure limits have a named owner and an explicit threshold. | M; B5, C3. |

### Stages D and E — optional context and broader access

| ID / priority | Work | Completion criteria | Effort / dependencies |
|---|---|---|---|
| D1 / important | **Evaluate the existing prediction engine.** Build the past-only evaluation described below and remove unvalidated additive calendar costs from the base estimate. | Forecast quality is measured against simple alternatives by horizon; missing coverage is excluded correctly; interval coverage and width are reported. No “trusted” label based only on sample count. Record dataset/outcome revisions and preserve the intervals actually issued; replayed calibration is not historical live performance. | L for harness; collecting future outcomes takes calendar time. A4/A5, B1–B3. |
| D2 / conditional | **Complete ICS behavior.** Expand recurring events in a bounded window; handle timezones, daylight-saving changes, cancellations, exceptions and duplicate imports. Refresh active calendar users independently of bank consent. | Blackboard/Canvas-style fixtures pass; a statement-only user has a truthful last-read/error state; learning does not imply attendance or a charge. | L; D1's rule for calendar contribution. |
| D3 / conditional | **Clarify location handling.** Make saved area/point retention visible and removable; prefer coarse context where enough. Keep venue category, spending purpose and reimbursement separate. | A user can skip location, see what is stored and delete it. A restaurant near work is not automatically called a work expense. No background GPS tracking is introduced. | M–L; B5 and the location value review. |
| E1 / native gate | **Verify native parity.** Run the supported flows in iOS Simulator and on Android, then check permissions, resume, offline/retry, account switching and source capture on a physical device where needed. | Screens and actions agree with the same server revision; Android capture behaves correctly; iPhone capture claims match what was actually tested. | L for simulator/API parity; separate device session. B4, C1. |
| E2 / banking gate | **Verify friend bank access with the provider.** Establish which access the existing account/application permits and what additional setup is required. Inspect real account/card fields and consent/reconnect behavior. | Provider eligibility for the intended audience is documented; permitted test connections succeed; unsupported banks/features are stated accurately. | External dependency; not a promised engineering duration. |

E1 blocks a native release, not a web-only pilot. E2 blocks offering live bank connections to friends, not a statement-based pilot. D2/D3 should be deferred if their value is weak; disable or limit the affected feature rather than making the core product depend on unfinished context.

## 5. Research we actually need

Research should answer a decision and end with a written result. It should not become an open-ended search for another model or architecture.

| Question | Method | Required output / decision |
|---|---|---|
| What should the daily number mean? | Walk through real student situations: money until next income, monthly budget and current bank liquidity. Observe which interpretation people assume. | One primary definition, plainly labelled. Other quantities have separate names; never hide the distinction inside one number. |
| Is the model better than a simple baseline? | At each historical checkpoint, train only on information available then. Compare with recent-average and weekday baselines at next-day, next-week and month-end horizons. | A dated evaluation report with sample size, absolute error, interval coverage and interval width. Keep the simpler method if the more complex one adds no reliable value. |
| Does calendar context help? | Compare otherwise identical predictions with and without calendar features. Separately ask testers whether a deadline/event note helped a decision. | Keep descriptive context only, add a measured predictive feature, or remove the feature. Temporal overlap alone does not justify a causal cost adjustment. |
| Does location help enough to justify collection? | Test merchant categorization and optional city/area context first. Observe actual misunderstandings corrected by it. | A specific useful task plus the least precise data needed. No useful task means no additional collection. |
| Do the pages and charts help? | Give five willing participants the same find/explain/correct tasks. Record completion, mistakes and where help was needed. | A short ranked usability list; retain charts and pages that reduce confusion, not those that merely look impressive. |
| Can bank data distinguish the instruments we need? | Inspect permitted provider responses and representative, consented or synthetic statements. Check stable IDs, suffixes, type, currency, pending/booked states and credit accounts. | A capability matrix by source. “Unknown” is a valid result; do not guess absent fields. |

**Forecast acceptance needs more than a test count.** Agree on the evaluation period, metric and acceptable interval width before inspecting results. A nominal 80% interval should be evaluated as an 80% interval, including the uncertainty caused by small samples. A minimum number of scored days is necessary but is not proof of accuracy. Synthetic histories validate arithmetic and edge cases; they do not establish real-world predictive performance.

**Causation is a later research question.** First describe associations honestly. “You spent more during exam weeks” is different from “exams caused you to spend more.” A user's explanation is a reported reason, not experimental proof. Any later personal experiment needs an explicit intervention, outcome, consent and a comparison that accounts for obvious confounders. We do not need a causal-model product to make the initial Money beta useful.

## 6. Reviews and tests required before calling work done

A feature moves through **implemented → reviewed → tested → released → observed useful**. Do not collapse those into one “done” label.

| Review or test | What it must establish |
|---|---|
| Financial rule review | Exact meaning of expense, outflow, income, personal share, liability and commitment; currencies never mixed without an explicit conversion policy. |
| Ownership/security review | Account/card/payment identifiers cannot cross users; inputs and uploads are bounded; changes require the correct owner. Review newly touched dependencies and current relevant advisories before release. |
| Privacy review | Data collection, copies, hidden facts, deletion and retention match the product's promises; cross-user learning is off by default. |
| Database integration tests | Provider identity transitions, repeated imports, score eligibility, rescoring/replay, transactions, retries, rollback, correction/undo and deletion behave under actual database constraints. Cover late arrivals beyond four days and repeated rebuild jobs. |
| Failure and concurrency tests | Slow sources, interrupted chat, partial writes, repeated actions, reconnects and out-of-order responses do not create false success or stale financial totals. |
| Browser tests | Desktop and phone journeys, keyboard/focus, visible error recovery, long names, multiple accounts, empty states and overflow. |
| Live model evaluations | A fixed set of ordinary, ambiguous and adversarial questions: same amount/different merchant, wrong month, one-off, split, refund, missing account, unavailable source and unsupported causal claims. Record failures and model/prompt versions. |
| Native tests | Real native layout and lifecycle behavior. A browser's iPhone viewport is not an iOS Simulator test; neither alone proves physical-device capture. |
| Release/operations review | Correct commit deployed once through the established path, migration/recovery evidence where needed, live smoke checks, source freshness, failed rebuild visibility and bounded costs. |

Preserve existing passing tests. Add tests for meaningful behavior and failure cases; do not spend time testing every reversible CSS value. Reduce the existing lint/type debt when touching those areas, and prevent new debt from being hidden by the aggregate baseline.

## 7. Gates for the ten-friend beta

### Gate 1 — owner verification

- [ ] #419 or its reviewed successor is deployed; repeated live sync does not recreate repaired duplicates.
- [ ] The prior duplicate repair and reported rescore have an auditable, reconciled outcome.
- [ ] Only eligible, sufficiently covered days train the band; corrected outcomes rescore automatically while original forecasts remain intact.
- [ ] A1's reference examples agree across every enabled financial surface.
- [ ] No known ownership leak or cross-account merge remains in the enabled flow.
- [ ] Recurring costs and unknown history are handled correctly, or the affected prediction is withheld.
- [ ] Corrections are acknowledged accurately and can be undone.
- [ ] Deletion works for enabled data and copies; unfinished sensitive features are disabled.
- [ ] Unvalidated calendar costs and cross-user priors do not silently influence the estimate.
- [ ] Current release checks pass; recovery and live verification are recorded.

### Gate 2 — two-friend supervised web pilot

- [ ] Each person can import their own statement into the right account.
- [ ] Each can find a payment, explain the daily figure's basis and correct a split or classification.
- [ ] Chat's real answers are reviewed for financial correctness, evidence and honest limits.
- [ ] Missing data, duplicate imports, logout/login and a failed request are exercised.
- [ ] At least one end-to-end data-removal exercise succeeds with an isolated test account.
- [ ] Critical mistakes are fixed before adding more people.

### Gate 3 — expand to ten friends

- [ ] The issues from the two-person pilot are resolved and regression-tested.
- [ ] Every enabled source has an accurate freshness/error state and a verified access path.
- [ ] No known high-severity money, ownership or deletion defect remains in the enabled scope.
- [ ] Users understand that estimates are experimental; unsupported features remain withheld.
- [ ] There is a clear support route, a bounded operating cost and a way to pause a faulty feature.

Do not promise a launch date from engineering estimates alone. Provider access, future forecast outcomes and participant availability are separate dependencies. Expand when these gates pass, not because the screen looks finished.

## 8. What we should not build yet

- Another autonomous “brain” or a general multi-agent finance manager.
- Background location tracking or automatic work/commute explanations inferred from proximity.
- Cross-friend behavioral learning without a demonstrated benefit and explicit consent.
- More decorative artwork, a separate brain visualization or a redesign of the entire legacy platform.
- A graph database, microservices or an enterprise event bus for this beta.
- Full Canvas/Blackboard functionality beyond what the read-only feed actually provides.
- More confident wording as a substitute for better coverage and evaluation.

Use the existing financial engine, ordinary database transactions and a small, durable record of pending rebuild work. Add complexity only for a reproduced problem that the simpler approach cannot solve.

## 9. The next working sessions

**Session 0 — stop recurrence and verify recovery:** review/release #419, check the repair already performed, and observe a subsequent feed sync. Record R0/R1 evidence and the exact deployed commit. Do not call the ledger clean merely because a reference fixture passes.

**Session 1 — establish truth and conservative defaults:** implement A1 and A2, confirm the definition of the daily figure, and reproduce the remaining coverage/weekly-bill/transfer failures. Produce a short list of failing examples and the proposed data changes.

**Session 2 — fix how the model learns:** implement A4 and A5 before adding financial features. Demonstrate late settlement, an already-scored correction, automatic calibration replay, retry and preserved original forecasts. Settle A6 before page simplification; leave CSS unchanged until then.

**Session 3 — fix the numbers:** implement B1 and the first B2/B3 slices. Review migrations against A3. Demonstrate before/after results on the reference ledger before changing live data.

**Session 4 — make corrections trustworthy:** implement B4 and B5 in small reviewed slices, then B6/B7. Demonstrate correction, failure, retry, undo, reload and deletion across the affected views. This will span more than one coding session if the schema changes are substantial.

**After those gates:** complete the account/navigation work, run the two-friend pilot, and use its failures to choose the next work. Run forecast evaluation in parallel with that supervised learning period; do not enable calendar/location-based predictions merely because their integrations exist.

## 10. Progress log

Keep this document current after each meaningful release. For each task, record: status, commit/PR, tests or research evidence, remaining limitation and date. Research is complete only when its decision is recorded; implementation is complete only when its acceptance criteria pass.

| Date | Task | Status | Evidence / next action |
|---|---|---|---|
| 18 September 2026 | Baseline release | Shipped and smoke-tested | PR #417; release evidence linked above. |
| 18 September 2026 | Duplicate prevention / R0 | Merged; deployment verification pending | #419 merged as `01ac9489`, including a reproduced two-purchase/three-row fix and persisted regression tests. Deployment/live sync verification follows. |
| 18 September 2026 | Repair and rescore / R1 | Reported applied by Fable | Widening reportedly €121.38 → €50.19; Sep 13 actual reportedly €51.50 → €125.08. Production amounts not independently checked in this revision. Verify existing evidence before further writes. |
| 18 September 2026 | A4/A5 | Defects verified; implementation pending | Next-day eligibility and never-scored-only selection confirmed in current main. Manual rescore script is recovery tooling, not automatic propagation. |
| 18 September 2026 | Spacing / A6 | Prior claim corrected | 40px shipped/rendered; authenticated reference and design acceptance not established. 128/96 register conflict remains unresolved. No CSS changed. |
| 18 September 2026 | This roadmap | Revised after reconciliation feedback | Stage 0 and early scoring work now precede feature work. Launch gates remain unchecked. |

## 11. Evidence for this revision

Code citations refer to the PR #417 baseline/main `6b806743`; #419 sources refer to the inspected commit, not merged code.

- Daily eligibility: [predictions.js:82](/Users/stefanogebara/code/twinme-money-product/api/services/money/predictions.js:82), especially lines 92 and 97. Never-scored-only selection: [predictions.js:214](/Users/stefanogebara/code/twinme-money-product/api/services/money/predictions.js:214).
- Existing four-day reconciliation window: [ledger.js:14](/Users/stefanogebara/code/twinme-money-product/api/services/money/ledger.js:14). Chronological calibration and accumulated widening: [calibration.js:103](/Users/stefanogebara/code/twinme-money-product/api/services/money/calibration.js:103).
- Bank reference alias changes and matching are in [#419's diff](https://github.com/stefanogebara/twin-me/pull/419/files); its [manual rescore script](https://github.com/stefanogebara/twin-me/blob/0b950e645d2d2a1478ee1981bd2a58de3451a518/scripts/money/rescore-figures.mjs) is explicit operator tooling.
- Spacing contract: [CLAUDE.md:468](/Users/stefanogebara/code/twinme-money-product/CLAUDE.md:468), [register.css:101](/Users/stefanogebara/code/twinme-money-product/src/styles/register.css:101). Shipped override: [money-v2.css:40](/Users/stefanogebara/code/twinme-money-product/src/styles/money-v2.css:40). The earlier audit's reference limitation remains applicable: sign-in access did not establish the authenticated workspace's spacing.


## Implementation log — after authorization

- R0: reviewed and merged #419 as 01ac9489. Identity lookup migration applied. Production deployment verification pending at this entry.
- R1: independently confirmed widening €50.19 and September 13 actual €125.08. No additional merge was applied: full linked evidence showed distinct booked references in the remaining ambiguous group.
- Chat focus: removed the duplicate inner rectangle from Today and Ask; pointer/keyboard checks pass at desktop and phone sizes in 48 browser journeys.
- A6: the latest #419 restores the repository's 128px/96px register. Technical browser checks pass. No new claim of an independently measured authenticated Instinct workspace or user usability acceptance is made.
- A4/A5: settling delay, complete-read gate and durable automatic rescoring implemented for review/testing. Full historical coverage tracking remains B1; statement-only histories are withheld from scoring. Additive scoring migration must precede application deployment.
- Other Stage A tasks and Stage B–E remain open. This release does not complete the reference-ledger suite, conservative-default review, broader correction/undo guarantees, privacy/deletion work or friend-pilot gates.

Implementation and evidence: [settlement/focus log](../2026-09-18-money-settlement-focus/README.md).
