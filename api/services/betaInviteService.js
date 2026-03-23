/**
 * Beta Invite Service
 * Manages invite codes, validation, redemption, and waitlist for beta access.
 */

import crypto from 'crypto';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('BetaInvite');

/**
 * Check if beta gate is enabled.
 * When BETA_GATE_ENABLED=false, all signups pass through.
 */
export function isBetaGateEnabled() {
  return process.env.BETA_GATE_ENABLED !== 'false';
}

/**
 * Validate an invite code without redeeming it.
 * @returns {{ valid: boolean, invite?: object, error?: string }}
 */
export async function validateInviteCode(code) {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Invite code is required' };
  }

  const { data: invite, error } = await supabaseAdmin
    .from('beta_invite_codes')
    .select('*')
    .eq('code', code.trim().toLowerCase())
    .single();

  if (error || !invite) {
    return { valid: false, error: 'Invalid invite code' };
  }

  if (invite.use_count >= invite.max_uses) {
    return { valid: false, error: 'This invite code has already been used' };
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { valid: false, error: 'This invite code has expired' };
  }

  return { valid: true, invite };
}

/**
 * Atomically redeem an invite code for a user.
 * Uses use_count < max_uses guard to prevent double-redemption.
 */
export async function redeemInviteCode(code, userId) {
  const trimmed = code.trim().toLowerCase();

  // Atomic update: only succeeds if use_count < max_uses
  const { data, error } = await supabaseAdmin.rpc('redeem_beta_invite', {
    p_code: trimmed,
    p_user_id: userId,
  });

  // If RPC doesn't exist, fall back to manual update
  if (error?.message?.includes('function') || error?.code === '42883') {
    log.info('RPC not available, using manual redemption');
    return redeemManual(trimmed, userId);
  }

  if (error) {
    log.error('Failed to redeem invite', { error, code: trimmed });
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

async function redeemManual(code, userId) {
  // Fetch current state
  const { data: invite, error: fetchErr } = await supabaseAdmin
    .from('beta_invite_codes')
    .select('id, use_count, max_uses')
    .eq('code', code)
    .single();

  if (fetchErr || !invite) {
    return { success: false, error: 'Invite code not found' };
  }

  if (invite.use_count >= invite.max_uses) {
    return { success: false, error: 'Invite code fully redeemed' };
  }

  // Update atomically with use_count guard
  const { error: updateErr } = await supabaseAdmin
    .from('beta_invite_codes')
    .update({
      use_count: invite.use_count + 1,
      used_by_user_id: userId,
      used_at: new Date().toISOString(),
    })
    .eq('id', invite.id)
    .lt('use_count', invite.max_uses);

  if (updateErr) {
    log.error('Manual redemption failed', { error: updateErr });
    return { success: false, error: updateErr.message };
  }

  // Link invite to user
  await supabaseAdmin
    .from('users')
    .update({ invite_code_id: invite.id })
    .eq('id', userId);

  // Auto-upgrade beta users to Plus plan (no Stripe needed for beta)
  await supabaseAdmin
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      plan: 'pro',   // DB "pro" = user-facing "Plus" ($20/mo)
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .then(({ error: subErr }) => {
      if (subErr) log.warn('Failed to upgrade beta user to Plus', { userId, error: subErr.message });
      else log.info('Beta user auto-upgraded to Plus', { userId });
    });

  log.info('Invite redeemed', { code, userId });
  return { success: true };
}

/**
 * Check if an email has a pre-assigned (unused) invite code.
 * Returns the invite row if found, null otherwise.
 */
export async function isEmailPreInvited(email) {
  if (!email) return null;

  const { data, error } = await supabaseAdmin
    .from('beta_invite_codes')
    .select('*')
    .eq('created_for_email', email.toLowerCase().trim())
    .lt('use_count', 1) // Only unused codes — max_uses is typically 1
    .limit(1)
    .single();

  if (error || !data) return null;

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  return data;
}

/**
 * Generate a new invite code.
 */
export async function createInviteCode({ email, name, maxUses = 1, expiresAt, metadata = {} } = {}) {
  const code = crypto.randomBytes(4).toString('hex'); // 8-char hex like "a3f7b1c2"

  const { data, error } = await supabaseAdmin
    .from('beta_invite_codes')
    .insert({
      code,
      created_for_email: email?.toLowerCase().trim() || null,
      created_for_name: name || null,
      max_uses: maxUses,
      expires_at: expiresAt || null,
      metadata,
    })
    .select()
    .single();

  if (error) {
    log.error('Failed to create invite code', { error });
    throw new Error(`Failed to create invite: ${error.message}`);
  }

  log.info('Invite code created', { code, email, name });
  return data;
}

/**
 * Add email to the beta waitlist (upsert — no duplicates).
 */
export async function addToWaitlist(email, name, source = 'waitlist_page') {
  if (!email) return;

  const { error } = await supabaseAdmin
    .from('beta_waitlist')
    .upsert(
      {
        email: email.toLowerCase().trim(),
        name: name || null,
        source,
      },
      { onConflict: 'email' }
    );

  if (error) {
    log.error('Failed to add to waitlist', { error, email });
    // Non-critical — don't throw
  } else {
    log.info('Added to waitlist', { email, source });
  }
}

/**
 * List all invite codes (admin).
 */
export async function listInviteCodes() {
  const { data, error } = await supabaseAdmin
    .from('beta_invite_codes')
    .select('*, used_by:users!beta_invite_codes_used_by_user_id_fkey(id, email, first_name)')
    .order('created_at', { ascending: false });

  if (error) {
    log.error('Failed to list invites', { error });
    return [];
  }
  return data;
}

/**
 * List all waitlist entries (admin).
 */
export async function listWaitlist() {
  const { data, error } = await supabaseAdmin
    .from('beta_waitlist')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    log.error('Failed to list waitlist', { error });
    return [];
  }
  return data;
}

/**
 * Remove email from waitlist (after converting to invite).
 */
export async function removeFromWaitlist(email) {
  await supabaseAdmin
    .from('beta_waitlist')
    .delete()
    .eq('email', email.toLowerCase().trim());
}
