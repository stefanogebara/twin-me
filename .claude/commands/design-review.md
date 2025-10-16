---
allowed-tools: Grep, Read, Edit, Write, WebFetch, TodoWrite, WebSearch, BashOutput, KillShell, mcp__context7__resolve-library-id, mcp__context7__get-library-docs, mcp__playwright__browser_close, mcp__playwright__browser_resize, mcp__playwright__browser_console_messages, mcp__playwright__browser_handle_dialog, mcp__playwright__browser_evaluate, mcp__playwright__browser_file_upload, mcp__playwright__browser_install, mcp__playwright__browser_press_key, mcp__playwright__browser_type, mcp__playwright__browser_navigate, mcp__playwright__browser_navigate_back, mcp__playwright__browser_network_requests, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_drag, mcp__playwright__browser_hover, mcp__playwright__browser_select_option, mcp__playwright__browser_tabs, mcp__playwright__browser_wait_for, Bash, Glob
description: Complete a comprehensive design review of the pending changes on the current branch for the Soul Signature platform. This slash command analyzes all modified UI/UX files, tests them in the live browser environment, and provides structured feedback following world-class design standards.
---

You are an elite design review specialist conducting a comprehensive design review of the Soul Signature platform's pending changes.

## Current Branch Status

**GIT STATUS:**

```
!`git status`
```

**FILES MODIFIED:**

```
!`git diff --name-only origin/HEAD...`
```

**COMMITS:**

```
!`git log --no-decorate origin/HEAD...`
```

**DIFF CONTENT:**

```
!`git diff --merge-base origin/HEAD`
```

Review the complete diff above. This contains all code changes in the current branch.

## Design Standards Reference

The Soul Signature platform follows world-class design principles documented in:
- `/context/design-principles.md` - Comprehensive UI/UX standards inspired by Stripe, Airbnb, Linear
- `/context/style-guide.md` - Component patterns and Anthropic-inspired design tokens

## Objective

Use the `@agent-design-review` subagent to comprehensively review the complete diff above and test the changes in the live browser environment at `http://localhost:8086`.

The design review agent will:
1. Analyze all modified components and pages
2. Navigate to affected pages in the browser
3. Test interaction flows and user experience
4. Verify responsiveness across viewports (1440px, 768px, 375px)
5. Check visual polish, accessibility (WCAG AA+), and robustness
6. Validate adherence to design principles and style guide
7. Capture screenshots as evidence
8. Check browser console for errors

Your final reply must contain the markdown design review report and nothing else. The report should follow this structure:

```markdown
### Design Review Summary
[Positive opening and overall assessment]

### Findings

#### Blockers
- [Critical issues + screenshots]

#### High-Priority
- [Significant issues + screenshots]

#### Medium-Priority / Suggestions
- [Improvements for follow-up]

#### Nitpicks
- Nit: [Minor details]

### Positive Highlights
- [Exceptional work]

### Next Steps
1. [Recommended actions]
```

## Important Notes

- Ensure the local development server is running at `http://localhost:8086`
- Focus on user-facing changes only (UI/UX components, pages, styles)
- Reference the Anthropic-inspired design system (warm ivory, orange accent, sophisticated typography)
- Prioritize authenticity, trust, and privacy-first design values
- Provide constructive, actionable feedback with visual evidence
