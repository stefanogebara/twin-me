/**
 * The billing tables (audit M2-D, 2026-09-22): the Stripe events already handled, and one
 * subscription row per person. Thin builders; the route keeps its control flow.
 */
import { supabaseAdmin } from '../database.js';
export { findUserById } from '../auth/authStore.js';

/** Insert fails on a repeated event id: that is the idempotency check, read by the route. */
export function recordWebhookEvent(eventId, eventType) {
  return supabaseAdmin.from('stripe_webhook_events').insert({ event_id: eventId, event_type: eventType });
}
/** A handler that failed hands the id back so Stripe's retry is processed. */
export function forgetWebhookEvent(eventId) {
  return supabaseAdmin.from('stripe_webhook_events').delete().eq('event_id', eventId);
}
export function upsertSubscription(row, options = { onConflict: 'user_id' }) {
  return supabaseAdmin.from('user_subscriptions').upsert(row, options);
}
export function findSubscriptionByStripeId(stripeSubscriptionId) {
  return supabaseAdmin.from('user_subscriptions').select('user_id').eq('stripe_subscription_id', stripeSubscriptionId).single();
}
export function findSubscriptionForUser(userId, columns) {
  return supabaseAdmin.from('user_subscriptions').select(columns).eq('user_id', userId).single();
}
export function updateSubscriptionForUser(userId, patch) {
  return supabaseAdmin.from('user_subscriptions').update(patch).eq('user_id', userId);
}
/** Retention: events older than the cutoff go; answers the ids removed and their count. */
export function forgetWebhookEventsBefore(cutoffIso) {
  return supabaseAdmin.from('stripe_webhook_events').delete({ count: 'exact' }).lt('received_at', cutoffIso).select('event_id', { count: 'exact' });
}
