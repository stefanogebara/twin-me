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

Pending final release results. Initial reproduction: two payments became three. With the fix: 62 allowance/database tests pass, including 27 real-Postgres cases. Application suite, browser journeys and baseline gate are running.
