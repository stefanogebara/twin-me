# Settlement and composer focus release

User authorized implementation and release on 18 September 2026, including the rectangular chat focus defect. This work is based on PR #419 at ec3b4d38. Preserve other worktrees and the pending roadmap edits.

## Order

1. Review #419; close reproduced identity gaps before release. Verify prior repairs read-only. Apply the additive identity lookup migration, release once, check production.
2. Implement settling delay and automatic outcome reconciliation with preserved issued predictions, bounded work and durable retry behavior. Verify before the next financial release.
3. Record exact completed slices and remaining roadmap work. Do not call the entire beta ready.

## Review findings and decisions

- Two identical booked fallback rows become three payments when stable references arrive. Reproduced in bankIdentity.test.js; add occurrence-suffixed alias lookup and reserve exact identities before alias matching. Real Postgres tests cover separate pages, repeated sync and retained corrections.
- An older unassigned payment does not prove inclusion in a snapshot. Retain the existing conservative balance uncertainty behavior; fix identity rather than assume away pending liabilities.
- Repair tooling in #419 is operator-only: its REST apply path is not atomic. Do not rerun it automatically. Verify the already reported repair; any further repair needs reviewed evidence and an atomic operation.
- Latest #419 restores the documented register, including 128px desktop / 96px phone sections. These values are an existing project target, not a new independently measured Instinct claim.

## Focus reference lock

Existing Money compound composer plus Refero craft-details.md focus guidance. Preserve the current register, type, field geometry and controls. Put the text-entry focus indicator on the enclosing field, suppress only its redundant child outline; attachment/send buttons retain their own keyboard indicators. No global removal of outlines, no new visual language. Browser evidence before fix: the home input has radius 0 and a 2px solid outline inside a 28px container on production. Verify pointer and keyboard entry on both Today and Ask at phone and desktop widths.

## Verification

PR #419 merged as 01ac9489 after all six required checks passed. Local evidence: 5,366 application tests, 27 real-Postgres cases, 48 desktop/phone journeys, build and unchanged lint/type baselines. Initial reproduction: two payments became three. The identity lookup migration is applied; original function definition saved privately for rollback. Production deployment is still building at this log entry.

Read-only live verification confirmed widening 50.19 and September 13 stored actual 125.08. One fingerprint-only candidate was investigated across ALL linked evidence; two different booked bank references were found, so no further payment merge was performed.

## Settling and rescoring implementation

Four elapsed days after the financial day closes; cutoff uses Europe/Madrid (or MONEY_TZ) and tests cover the autumn clock change. A source must have completed a bank read after the settling boundary. Partial, unknown and statement-only sources do not become scored zero-spend days. This is a completed-read gate, not yet proof of every historical account/date interval: full coverage tracking remains B1.

A private per-owner revision is invalidated by payment, fact, account and prediction changes. Forecast and accuracy reads reconcile dirty scores; the existing scheduled learning path also does so. One consistent database snapshot, bounded to 400 days / 2,000 figures / 10,000 payments, supplies the rebuild. Atomic commit rejects a concurrent financial change, records outcome changes, and keeps failures dirty for retry. Repeated/concurrent reads do not duplicate audit changes. No new cron or model call.

Original predictions stay unchanged. New daily predictions additionally store the interval issued at recording time. Corrected outcomes replay training, while recorded intervals stay fixed. Older rows lack the issued interval: their historical display is still reconstructed, not verified as-issued performance. That limitation belongs in D1.

The manual rescore command now uses this same atomic path for --apply. Its read-only arithmetic comparison is labelled separately because settling/source gates can withhold rows.

Database tests cover late settlement, deletion, correction/undo, recurring flags, facts, date moves, premature score withdrawal, incomplete sources, concurrent readers/writers, failed audit writes/retry, immutable recording and ownership. Pending final checks and scoring deployment. Recovery: roll back the application if needed; leave additive schema in place and retain the audit. Rebuild from current evidence after resolving an error rather than restoring obsolete outcomes as truth.
