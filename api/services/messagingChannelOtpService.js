/**
 * messagingChannelOtpService — one-time codes that prove OWNERSHIP of a
 * messaging channel_id (e.g. a WhatsApp phone) before it is linked into
 * messaging_channels.
 *
 * Closes the M1 gap where POST /api/whatsapp-link/link trusted any phone the
 * caller submitted. Security posture (table: messaging_channel_otp):
 *   - codes are stored HASHED (HMAC-SHA256), never in plaintext
 *   - codes expire (OTP_TTL_MS) and are single-use (consumed_at)
 *   - verification is attempt-capped (OTP_MAX_ATTEMPTS) to blunt brute force
 *   - resends are cooldowned (OTP_RESEND_COOLDOWN_MS) to blunt send-spam
 *   - hash compare is constant-time
 *
 * The service never sends anything itself — it returns the plaintext code to
 * the caller, which delivers it over the channel being verified (proving the
 * caller controls that channel_id).
 */
import crypto from 'crypto';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('MessagingChannelOtp');

export const OTP_TTL_MS = 10 * 60 * 1000;          // codes valid for 10 minutes
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;   // min gap between sends
export const OTP_MAX_ATTEMPTS = 5;                 // verify tries before lockout
const CODE_DIGITS = 6;
const TABLE = 'messaging_channel_otp';

function hashCode(code) {
  // HMAC with a server secret: a 6-digit code is only 1M-wide, so a plain
  // SHA-256 would be trivially brute-forced from a DB leak. The HMAC key keeps
  // offline guessing infeasible without the server secret.
  const secret = process.env.OTP_HMAC_SECRET || process.env.JWT_SECRET || 'twinme-otp-fallback';
  return crypto.createHmac('sha256', secret).update(String(code)).digest('hex');
}

function generateCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(CODE_DIGITS, '0');
}

function safeEqualHex(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string' || aHex.length !== bHex.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Issue a fresh OTP for (userId, channel, channelId). Returns the plaintext
 * code for the caller to deliver over the channel. Enforces a resend cooldown
 * and keeps a single active (unconsumed) code per tuple.
 */
export async function requestChannelOtp({ userId, channel = 'whatsapp', channelId, ipAddress = null }) {
  if (!userId || !channelId) return { success: false, error: 'missing_params' };

  // Resend cooldown: refuse to reissue if a fresh unconsumed code already exists.
  const { data: existing } = await supabaseAdmin
    .from(TABLE)
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('channel', channel)
    .eq('channel_id', channelId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  const last = existing && existing[0];
  if (last) {
    const age = Date.now() - new Date(last.created_at).getTime();
    if (age < OTP_RESEND_COOLDOWN_MS) {
      return { success: false, error: 'cooldown', retryAfterMs: OTP_RESEND_COOLDOWN_MS - age };
    }
  }

  // Single active code per tuple: clear prior unconsumed codes.
  await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('channel', channel)
    .eq('channel_id', channelId)
    .is('consumed_at', null);

  const code = generateCode();
  const { error } = await supabaseAdmin.from(TABLE).insert({
    user_id: userId,
    channel,
    channel_id: channelId,
    code_hash: hashCode(code),
    attempts: 0,
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    ip_address: ipAddress,
  });

  if (error) {
    log.error('Failed to store OTP', { userId, channel, error: error.message });
    return { success: false, error: 'storage_failed' };
  }

  return { success: true, code, ttlMs: OTP_TTL_MS };
}

/**
 * Verify a submitted code against the latest active OTP for the tuple. On
 * success the code is consumed (single-use). On a wrong code the attempt
 * counter increments toward the lockout cap. Returns { success, reason? }.
 */
export async function verifyChannelOtp({ userId, channel = 'whatsapp', channelId, code }) {
  if (!userId || !channelId || !code) return { success: false, reason: 'missing_params' };

  const { data: rows, error } = await supabaseAdmin
    .from(TABLE)
    .select('id, code_hash, attempts, expires_at, consumed_at')
    .eq('user_id', userId)
    .eq('channel', channel)
    .eq('channel_id', channelId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    log.error('Failed to load OTP', { userId, channel, error: error.message });
    return { success: false, reason: 'storage_failed' };
  }

  const row = rows && rows[0];
  if (!row) return { success: false, reason: 'not_found' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { success: false, reason: 'expired' };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { success: false, reason: 'too_many_attempts' };

  if (!safeEqualHex(row.code_hash, hashCode(code))) {
    await supabaseAdmin.from(TABLE).update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return {
      success: false,
      reason: 'invalid',
      attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - (row.attempts + 1)),
    };
  }

  // Correct code — consume it (optimistic: only if still unconsumed).
  const { error: consumeErr } = await supabaseAdmin
    .from(TABLE)
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('consumed_at', null);

  if (consumeErr) {
    log.error('Failed to consume OTP', { userId, channel, error: consumeErr.message });
    return { success: false, reason: 'storage_failed' };
  }

  return { success: true };
}
