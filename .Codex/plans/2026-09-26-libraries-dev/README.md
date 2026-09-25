# Libraries.dev project integration

User requested installing the Libraries.dev skills in the project and substituting their libraries. The official free skill covers all seven packages. Install it unmodified at .agents/skills/libraries-dev, make it discoverable to Claude as well, retain MIT attribution and pin the upstream SHA. User explicitly authorized installation, so the upstream generic self-install restriction does not require another approval.

Replace the vendored thinking-orbs0.3.1 web geometry with exact pinned thinking-orbs0.3.2 through its documented public engine entrypoint. Keep the tested LedgerOrb adapter lifecycle and explicit light theme; retain the small photograph-ground painter for Presence. This is a maintained dependency substitution, not the unfinished Ask layout redesign. Voice already uses voice-glow. Other effects remain available as skills; no forced ornament, microphone permission request, Pro purchase, native Skia dependency or financial code change.

Validation: compare real upstream geometry/painter output with the existing adapter contract, run motion and theme/photo regressions, strict types/build/lint and existing Money browser suite, inspect actual canvas rendering/reduced motion. Measure bundle difference. Required CI and one normal Git deployment if released. Existing owner checkout changes must remain untouched except the newly requested project skill directory/link, added only if absent.

Reference lock: current register/CLAUDE.md controls page composition; Libraries.dev exact monochrome orb supplies animation geometry. Public skill references and upstream package source verified at f20116327f4e3b28d0fb70b04437dfd092bf88fe. SecondBrain index and TwinMe project page used as historical context, current repository checked live.

## Verified before release

- Official skill and seven references installed unmodified; nine recorded source/license hashes independently matched the pinned upstream. Claude relative symlink resolves. Same skill installed in the owner's existing checkout without changing its existing files; available to subsequent agent turns.
- Exact54 geometry comparisons (9 states ×2 tuned sizes ×3 instants) matched the former implementation. Independent72 painter comparisons found all light/photo cases identical; three dark cases differ by only one RGB level due to upstream rounding order.
-28 focused orb/instruction tests, strict Money types, focused lint and build pass.74 desktop/phone browser checks pass; new real-canvas check proves pixels draw, live reduced motion freezes/resumes and completion removes the pending orb. No artificial progress, duplicate composer indicator or financial change.
- Build total across43 JS chunks:611.87→612.28 KB gzip (+0.41 KB, rounded build reports); Money chat remains5.84 KB gzip. Only one runtime package added; no new transitive runtime package.
- Independent code review: no material findings. Native renderer and voice-glow are unchanged; no mobile binary release or Pro installation. This is not closure of the separate9/10 Ask composition goal.
- New browser prerequisites/assertions are additive; no prior assertion was weakened. CI remains the merge gate.
