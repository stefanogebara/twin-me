/**
 * TrueLayer Webhook — Standalone Vercel Serverless Function, Phase 4
 * =====================================================================
 * Extracted from the Express monolith (same pattern as api/webhook-pluggy.js)
 * so it builds as a tiny independent lambda.
 *
 * TrueLayer signs webhooks with RSA (kid rotation via their JWKS endpoint),
 * so we can fail-closed on signature mismatch. Much stronger than Pluggy's
 * shared-header secret.
 *
 * Events (TrueLayer webhook types we care about):
 *   - transaction_created     (new tx on a connected account)
 *   - transaction_updated     (modification, e.g. merchant enrichment)
 *   - connection_status_changed  (consent revoked, re-auth needed)
 *   - consent_expired         (90-day consent rollover — LGPD/PSD2)
 */

import crypto from 'crypto';
import { supabaseAdmin } from './services/database.js';
import { syncUserConnection } from './services/transactions/trueLayerIngestion.js';
import { createLogger } from './services/logger.js';

const log = createLogger('truelayer-webhook-lambda');

const TL_JWKS_URL = (process.env.TRUELAYER_ENV === 'production')
  ? 'https://webhooks.truelayer.com/.well-known/jwks'
  : 'https://webhooks.truelayer-sandbox.com/.well-known/jwks';

let cachedJwks = null;
let cachedJwksAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1h

async function fetchJwks() {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAt < JWKS_TTL_MS) return cachedJwks;
  const res = await fetch(TL_JWKS_URL);
  if (!res.ok) throw new Error(`JWKS fetch ${res.status}`);
  cachedJwks = await res.json();
  cachedJwksAt = now;
  return cachedJwks;
}

/**
 * Verify TrueLayer's Tl-Signature header (JWS-like, compact form:
 *   base64url(header).base64url(payload).base64url(signature)
 * ).
 * Header contains `kid` matching a public key in the JWKS. We reconstruct the
 * signing input from headers + body and verify with the matching RSA key.
 */
async function verifyTrueLayerSignature(req, rawBody) {
  const sig = req.headers['tl-signature'] || req.headers['Tl-Signature'];
  if (!sig) return false;

  try {
    const [encHeader, , encSig] = String(sig).split('.');
    if (!encHeader || !encSig) return false;
    const header = JSON.parse(Buffer.from(encHeader, 'base64url').toString('utf8'));
    const jwks = await fetchJwks();
    const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
    if (!jwk) {
      log.warn(`no JWK for kid=${header.kid}`);
      return false;
    }

    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const signingInput = Buffer.from(`${encHeader}.${rawBody}`, 'utf8');
    const verifier = crypto.createVerify('RSA-SHA512');
    verifier.update(signingInput);
    return verifier.verify(publicKey, Buffer.from(encSig, 'base64url'));
  } catch (err) {
    log.warn(`signature verify error: ${err.message}`);
    return false;
  }
}

// Dedup across warm lambda invocations.
const seenEventIds = new Map();
const DEDUP_TTL_MS = 5 * 60 * 1000;

function isDuplicateEvent(eventId) {
  if (!eventId) return false;
  const now = Date.now();
  if (seenEventIds.size > 500) {
    for (const [id, ts] of seenEventIds.entries()) {
      if (now - ts > DEDUP_TTL_MS) seenEventIds.delete(id);
    }
  }
  const prev = seenEventIds.get(eventId);
  if (prev && now - prev < DEDUP_TTL_MS) return true;
  seenEventIds.set(eventId, now);
  return false;
}

async function resolveConnectionByCredentialsId(credentialsId) {
  const { data, error } = await supabaseAdmin
    .from('user_bank_connections')
    .select('id, user_id')
    .eq('provider', 'truelayer')
    .eq('truelayer_credentials_id', credentialsId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) log.warn(`resolve conn by cred_id ${credentialsId}: ${error.message}`);
  return data || null;
}

async function handleTransactionEvent(payload) {
  const credentialsId = payload.credentials_id || payload.credentialsId;
  if (!credentialsId) return;
  const conn = await resolveConnectionByCredentialsId(credentialsId);
  if (!conn) {
    log.warn(`no connection for credentials_id=${credentialsId}`);
    return;
  }
  // Full sync is cheap enough for the webhook path. The incremental window in
  // syncUserConnection keeps it under Pluggy-level cost.
  await syncUserConnection(conn.id);
}

async function handleStatusEvent(payload) {
  const credentialsId = payload.credentials_id || payload.credentialsId;
  const status = payload.status || payload.state;
  if (!credentialsId || !status) return;
  const mapped = {
    SUCCEEDED: 'UPDATED',
    FAILED: 'LOGIN_ERROR',
    REVOKED: 'DELETED',
    EXPIRED: 'WAITING_USER_INPUT',
  }[String(status).toUpperCase()] || String(status).toUpperCase();
  const patch = { status: mapped, updated_at: new Date().toISOString() };
  if (mapped === 'DELETED') patch.deleted_at = new Date().toISOString();
  await supabaseAdmin
    .from('user_bank_connections')
    .update(patch)
    .eq('provider', 'truelayer')
    .eq('truelayer_credentials_id', credentialsId);
}

async function dispatch(event, payload) {
  switch (event) {
    case 'transaction_created':
    case 'transaction_updated':
      await handleTransactionEvent(payload);
      break;
    case 'connection_status_changed':
    case 'consent_expired':
      await handleStatusEvent(payload);
      break;
    default:
      log.info(`ignored event: ${event}`);
  }
}

/**
 * Vercel handler. Reads raw body for signature verification, then parses JSON.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'method not allowed' });
    return;
  }

  // Vercel passes req.body parsed, but we need the raw string for signature
  // check. Re-serialize deterministically (same encoding TrueLayer signed).
  const rawBody = typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body ?? {});

  if (!(await verifyTrueLayerSignature(req, rawBody))) {
    res.status(401).json({ success: false, error: 'invalid signature' });
    return;
  }

  const payload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody || '{}');
  const event = String(payload.event || payload.event_type || '');
  const eventId = payload.event_id || payload.id;
  if (!event) {
    res.status(400).json({ success: false, error: 'missing event' });
    return;
  }
  if (isDuplicateEvent(eventId)) {
    res.status(200).json({ success: true, deduplicated: true });
    return;
  }

  log.info(`received ${event}`);

  try {
    await dispatch(event, payload);
    res.status(200).json({ success: true });
  } catch (err) {
    log.error(`dispatch ${event} failed: ${err.message}\n${err.stack}`);
    res.status(500).json({ success: false, error: 'dispatch failed' });
  }
}

export const config = {
  maxDuration: 60,
};
