# Sheet-feed approval guard

Status: independently reviewed; 142 targeted tests and focused lint pass. Awaiting release CI. No production wiring or migration.

## Scope

Bind a separately confirmed sheet preview to its canonical fetch URL, selected account,
parser interpretation, header position and exact header cells. Missing or changed approval
must withhold ingestion. Answering interpretation questions alone is not confirmation.

The pure `createSheetApproval(feed, rows, { confirmed: true })` helper returns a versioned
binding/schema fingerprint only when interpretation questions are resolved. A future route
must validate account ownership, present the preview, receive separate explicit confirmation,
and persist the approval server-side under its owner. The fingerprint is not an authorization
signature and must never be trusted merely because a client sends it. Never regenerate
approval automatically in a scheduled read.

`readSheetFeed` checks source/account/interpretation before downloading and header/schema
before ingestion. It also rechecks the binding and captured approval fields after the asynchronous download.
Replacing an approval with identical fields is allowed; changing/removing its version, binding
or schema is refused. Provider labels use exact/dot-subdomain boundaries, so lookalike names
such as evilgoogle.com cannot be rewritten into Google sources (this is not an SSRF fix). Header
insertion, reordering, renaming, movement and parser/source/account changes require another
review. Unchanged or added data rows retain approval; source query order and plan object key
order are canonicalized. Google edit and export URLs for the same document/tab share identity.

## Verification

- Failing first: 8 regression cases failed against the original implementation; 20 existing
  cases passed (`/tmp/money-sheet-approval-red.log`).
- Real parser + interpretation + importer fixtures cover missing consent, schema drift,
  every interpretation field, source/account changes, added/unchanged/reordered data rows,
  equivalent Google URLs, changed tabs and mutations during the download.
- Independent review followups: 8 additional cases failed before the domain-boundary and
  approval-snapshot fixes (`/tmp/money-sheet-approval-review-red.log`).
- Targeted verification: sheetFeed, statementShape and statementImport suites; see
  `/tmp/money-sheet-approval-green.log`: 142 tests passed.
- Fixtures are invented, contain no owner financial data, and perform no network or database writes.

## Rollout blockers deliberately remaining

1. Stable row identity, edits and deletion semantics. Current content-derived refs create new
   identities when date, amount or description changes; removed rows remain in the ledger.
   Schema approval does not make an edited row safe or reconcile it.
2. A safe fetch adapter: public DNS validation/pinning on every redirect, timeouts and streamed
   byte limits. Current URL validation is syntax only; passing it proves no network safety.
3. Registration/storage/scheduling, ownership and account-currency checks, source revocation,
   and a complete preview/confirmation UI. The module remains unwired.
4. Row-level partial/error and deferred/ignored-deleted reporting must be designed before rollout.

Do not advertise this as a shipped, synchronized sheet connection. The existing statement
upload route is separate and unchanged by this slice.
