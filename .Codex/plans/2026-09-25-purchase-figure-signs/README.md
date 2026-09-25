# Preserve signed purchase figures

Scope: a defensive saved-history display fix. Current newly issued allowances are clamped nonnegative; no negative live allowance was observed. The shared currency formatter intentionally uses an absolute magnitude, so the purchase renderer must retain an explicit negative sign on signed typed inputs. Verdict magnitudes remain positive under their existing over/left labels.

Validation: two actual React-render regressions (EUR/USD) failed on the original renderer and pass with the local formatter correction. Focused lint, strict Money types and diff check pass. Independent read-only review found no material issues. Required CI remains the release gate. No schema, ledger mutation, shared formatter change or visual redesign.

The separate Ask composition study remains below the owner’s requested independent 9/10 quality bar. It is not included in this release.
