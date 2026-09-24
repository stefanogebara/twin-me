/**
 * What the staying routes accept (audit M1-B, 2026-09-22).
 *
 * After the twin was unmounted (D20), the mounted surface is the product and what it needs:
 * money, sign-in, Presence, billing, the beta programme, the phone and WhatsApp channels,
 * the account. Every write among them runs validate() before its handler, the way money and
 * sign-in already did (M1-2). The rule is the same: a schema says what a field must be when
 * present and how long it may be — a type and a length, nothing more — and the handler keeps
 * its own required-field checks and its own messages. Unknown keys pass through. A 10 KB
 * "email" or an array where a string belongs is a 400 that names the field, before any
 * handler or any query sees it.
 *
 * Webhooks are not here: Stripe, GitHub, Gmail, Kapso and ElevenLabs verify a signature or a
 * shared secret, and the body's shape is the provider's contract, not ours. The goal test
 * names each exemption.
 */
import { z } from 'zod';

const loose = (shape) => z.object(shape).passthrough();
const text = (max) => z.string().max(max).optional().nullable();
const num = z.union([z.number(), z.string().max(32)]).optional().nullable();

/* The phone at the till (purchase-notification.js). */
export const PURCHASE_TRIGGER = loose({ appName: text(120), notificationText: text(4000), amount: num });

/* WhatsApp linking (whatsapp-link.js). */
export const WHATSAPP_LINK_REQUEST = loose({ phone: text(32) });
export const WHATSAPP_LINK_VERIFY = loose({ phone: text(32), code: text(16) });

/* Platform tokens (oauth-callback.js, calendar-oauth.js). */
export const PROVIDER_PARAM = z.object({ provider: z.string().min(1).max(32) });
export const CALENDAR_SYNC = loose({ daysAhead: num });

/* The account (account.js). */
export const ACCOUNT_LANGUAGE = loose({ language: text(16) });
export const ACCOUNT_TIMEZONE = loose({ timezone: text(64) });

/* Consent (consent.js). */
export const CONSENT_GIVE = loose({ consent_type: text(64), platform: text(64), consent_version: text(32) });
export const CONSENT_PARAMS = z.object({ consentType: z.string().min(1).max(64), platform: z.string().min(1).max(64) });

/* Feature flags (feature-flags.js). */
export const FEATURE_FLAG = loose({ flag: text(64), value: z.unknown().optional() });

/* Presence (presence.js, presence-call.js). Codex's area: types and lengths only, so the
   handlers' own rules and words are untouched. */
/* An id is a string of a sane length, not asserted to be a UUID: the handler owns the lookup
   and its own not-found, and a type check that outran the handler's contract broke a test. */
const ident = z.string().min(1).max(64);
export const PRESENCE_ID = z.object({ id: ident });
export const PRESENCE_TOKEN = z.object({ token: z.string().min(1).max(128) });
export const PRESENCE_ID_FACT = z.object({ id: ident, factId: ident });
export const PRESENCE_ID_USER = z.object({ id: ident, userId: ident });
/* The schedule as presence.js reads it: elder_phone, call_hour (a number), call_days (numbers,
   Monday 1), call_timezone; the emergency contact as emergency_name and emergency_phone. */
const schedule = {
  elder_phone: text(32), call_hour: num, call_timezone: text(64),
  call_days: z.array(z.union([z.number(), z.string().max(8)])).max(7).optional().nullable(),
  emergency_name: text(120), emergency_phone: text(32),
};
export const PRESENCE_CREATE = loose({ name: text(120), relationship: text(40), tone: text(80), language: text(16), ...schedule });
export const PRESENCE_PATCH = loose({ name: text(120), relationship: text(40), tone: text(80), language: text(16), status: text(32), ...schedule });
export const PRESENCE_CONSENT = loose({ kind: text(32), text_version: text(32) });
export const PRESENCE_PEOPLE = loose({ people: z.array(z.object({}).passthrough()).max(200).optional().nullable() });
export const PRESENCE_FACT = loose({ kind: text(32), question: text(500), answer: text(2000), source: text(32) });
export const PRESENCE_NOTE = loose({ body: text(4000) });
export const PRESENCE_ABOUT = loose({ text: text(20000) });
export const PRESENCE_VOICE_SAMPLE = loose({ sample_seconds: num });
export const PRESENCE_ASK = loose({ action: text(16), name: text(120), relation: text(80), called_by: text(120) });
export const PRESENCE_INVITE = loose({ role: text(32) });
export const PRESENCE_CALL_COMPLETE = loose({
  transcript: z.array(z.unknown()).max(5000).optional().nullable(), duration_seconds: num, conversation_id: text(128),
});

/* Billing (billing.js). */
export const BILLING_CHECKOUT = loose({ plan: text(32) });

/* The beta programme (beta.js, beta-public.js, beta-feedback.js, beta-admin.js). */
export const BETA_SIGNUP = loose({ name: text(120), email: text(254), platforms: z.array(z.string().max(64)).max(50).optional().nullable(), phone: text(16), reason: text(2000) });
export const BETA_ACTIVATE = loose({ email: text(254) });
export const BETA_VALIDATE = loose({ code: text(64) });
export const BETA_WAITLIST = loose({ email: text(254), name: text(120) });
export const BETA_FEEDBACK = loose({ category: text(64), message: text(4000), pageUrl: text(2000) });
