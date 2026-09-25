# Preserve signed purchase figures

Scope: a defensive saved-history display fix. Current newly issued allowances are clamped nonnegative; no negative live allowance was observed. The shared currency formatter intentionally uses an absolute magnitude, so the purchase renderer must retain an explicit negative sign on signed typed inputs. Verdict magnitudes remain positive under their existing over/left labels.

Validation: two actual React-render regressions (EUR/USD) failed on the original renderer and pass with the local formatter correction. Focused lint, strict Money types and diff check pass. Independent read-only review found no material issues. Required CI remains the release gate. No schema, ledger mutation, shared formatter change or visual redesign.

The separate Ask composition study remains below the owner’s requested independent 9/10 quality bar. It is not included in this release.

## Additional reviewed safety fix and browser prerequisite

The release also prevents a failed/null/malformed/thrown sibling-account read from being treated as confirmed absence and revoking shared provider consent. Four red-first regressions now pass with existing removal behavior (eight total). Local deletion results are preserved and `consent_ended` remains false. The static warning includes no raw provider error or account/session fields. This is not atomic deletion, a concurrency fence or derived-copy removal; those F02 tasks remain open. No live bank removal or provider cancellation was exercised.

Initial CI caught a test race: Enter occurred before saved-history response, and the trace had no stream request. Three normal-send browser cases now wait for the enabled send button; the separate deliberate early-Enter test remains intact. No production history guard is loosened.
