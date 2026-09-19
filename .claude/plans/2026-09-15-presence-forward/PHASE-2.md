# Phase 2 — the family around her, and the call that keeps its meaning

Branch `presence/phase-2` off main (2026-09-19). README sections 6 to 8 minus
what Phases 0 and 1 shipped, plus Stefano's request of 2026-09-19: the orb the
money pages use (thinking-orbs, vendored as `LedgerOrb`) on every voice and
loading surface. Test-first, one commit per task, explicit paths.

## Done
- [x] T1 Her call page and the family page's wait use `LedgerOrb`
      (`src/pages/presence/callOrb.ts` decides the state; 49efd0ec).
- [x] T2 A channel that did not answer says "tente de novo", not "link morto"
      (`fetchCallConfig` → `{ call } | { error: 'gone' | 'unavailable' }`; b1261468).

## Members and the companion role (README 7.3)
- [x] T3 `20260919_presence_members.sql`: `presence_members(presence_id, user_id,
      role owner|family|companion, invited_by)` unique per pair, owners backfilled;
      `presence_invites(presence_id, role, token, created_by, expires_at,
      accepted_by, accepted_at)`. Store: `listMembers`, `findMembership`,
      `addMember`, `removeMember`, `createInvite`, `findInviteByToken`,
      `acceptInvite`, `listPresencesForMember`. Tests pin the query shapes.
- [x] T4 `loadMember(req, res, { atLeast })` replaces `loadOwned` where a role
      may read: owner everything; family: overview (all but settings), notes,
      asks, conversations; companion: overview reduced to `presence` (name,
      schedule), `notes`, and `needs` (per conversation: id, called_at,
      needs_family, urgency; no summary, no transcript), plus `POST /notes`.
      Owner-only stays owner-only (patch, consent, voice, call-link, delete,
      members). New: `GET /:id/members`, `POST /:id/invites` `{ role }` →
      `{ join_path: '/presence/join/<token>' }` (7 days), `POST /join/:token`
      (any signed-in user; owner cannot join own; idempotent), `DELETE
      /:id/members/:userId` (owner, not self). `GET /mine` answers the owner's
      presence first, else the first membership, with `role`.
- [x] T5 Relay to members: the digest goes to every owner/family member with
      WhatsApp linked; a companion gets only the needs line when there is one,
      and the urgent message. `getMemberWhatsApp(presenceId)` in the store.
- [x] T6 Family page: section "Quem acompanha" under Configurações (owner):
      members with role, remove, "Convidar familiar" / "Convidar cuidadora" →
      link + WhatsApp share. `/presence/join/:token` page: sign in if needed,
      accept, land on `/presence/home`. The home renders by role (a companion
      sees Recados and Precisa de você only).

## Onboarding (README 6.1 step 3)
- [x] T7 "Três perguntas": after the voice note, a bounded three-turn chat that
      asks only what the extraction left open (who has died, never mention,
      what she loves telling). Server: `POST /:id/about/questions` returns the
      open questions from the readiness sources; answers land as facts through
      the existing `/facts`.

## Safety (README 8)
- [x] T8 Emergency contact on the presence (`emergency_name`, `emergency_phone`)
      in the brief ("se ela falar de dor forte, diga que vai avisar a Ana
      agora"); a keyword tripwire at summary time that forces `urgency: high`;
      "no answer twice" already relays — add the second-day escalation.

## Provider adapter (README 5.3)
- [x] T9 `api/services/voiceProvider.js`: `startOutboundCall`, `getConversation`,
      `verifyWebhook` behind one interface; ElevenLabs is the only implementation;
      the cron and the webhook route import the adapter.
