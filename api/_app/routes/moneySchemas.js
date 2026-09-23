/**
 * What each money write route accepts (M1-2, 2026-09-19). A schema says what a field must be
 * when present and how long it may be; the service behind the route still decides what it
 * means. Unknown keys pass through.
 */
import { z } from 'zod';

const id = z.string().min(1).max(64);
const uuid = z.string().uuid();
const short = z.string().max(120);
const loose = (shape) => z.object(shape).passthrough();

export const VERDICT = loose({ verdict: z.enum(['worth_it', 'not_me']).nullable().optional() });
export const READING_VERDICT = loose({ verdict: z.enum(['true', 'not_me']).nullable().optional() });
export const ID_PARAM = z.object({ id });
export const UUID_PARAM = z.object({ id: uuid });
export const CAPTURE = loose({
  text: z.string().max(4000).optional(), receivedAt: z.string().max(64).optional(), date: z.string().max(64).optional(),
  merchant: z.string().max(200).optional(), amount: z.union([z.number(), z.string().max(32)]).optional(),
  card: z.string().max(8).optional(), direction: z.string().max(16).optional(), eventId: z.string().max(200).optional(), ownerId: z.string().max(64).optional(),
});
export const BANK_CONNECT = loose({ bank: z.string().max(80).optional(), country: z.string().length(2).optional(), back: z.string().max(200).optional() });
export const CARD_TYPE_PARAMS = z.object({ accountId: uuid, last4: z.string().regex(/^\d{4}$/) });
export const CARD_TYPE = loose({ type: z.string().min(1).max(20) });
export const BANK_PULL = loose({ since: z.string().max(64).optional() });
export const STATEMENT_ACCOUNT = loose({ name: z.string().trim().min(1).max(60) });
export const PLACES_LOOKUP = loose({ limit: z.union([z.number().int().min(1).max(40), z.string().regex(/^\d{1,2}$/)]).optional() });
export const PLACE_CATEGORY_PARAMS = z.object({ merchantKey: z.string().min(1).max(120) });
export const PLACE_CATEGORY = loose({ category: z.string().max(40).nullable().optional(), name: z.string().max(120).optional() });
export const ANSWER = loose({
  questionId: z.string().max(120).nullable().optional(), kind: z.string().min(1).max(40),
  subject: short.nullable().optional(), subjectLabel: short.nullable().optional(),
  value: z.union([z.string().max(240), z.number()]).nullable().optional(),
  amount: z.union([z.number(), z.string().max(32)]).nullable().optional(),
  day: z.union([z.number().int().min(1).max(31), z.string().regex(/^\d{1,2}$/)]).nullable().optional(),
  share: z.union([z.number().min(0).max(1), z.string().max(8)]).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});
export const CHAT = loose({
  message: z.string().min(1).max(4000),
  history: z.array(loose({ role: z.enum(['user', 'twin']), text: z.string().max(8000) })).max(60).optional(),
});
export const CHAT_ACT = loose({ action: loose({ kind: z.string().min(1).max(40) }) });
export const CALENDAR_FEED = loose({ url: z.string().trim().min(1).max(2000) });
export const CHANNEL_OPT_IN = z.object({}).strict();
export const HOME = loose({
  district: short.nullable().optional(), city: short.nullable().optional(),
  lat: z.union([z.number().min(-90).max(90), z.string().max(24)]).nullable().optional(),
  lng: z.union([z.number().min(-180).max(180), z.string().max(24)]).nullable().optional(),
  source: z.string().max(40).nullable().optional(), place_id: z.string().max(200).nullable().optional(),
});
