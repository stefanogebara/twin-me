/**
 * The data-access layer for what stays (M2-D, 2026-09-22): every route file the product
 * reaches now reads and writes through a named store function instead of building the table
 * query inline. Each store is a thin builder; these record the chain each function makes so
 * the table, the columns and the filters cannot drift from what the routes relied on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rec = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../../api/_app/services/database.js', () => {
  const chain = (table) => {
    const q = new Proxy({}, {
      get: (_t, key) => {
        if (key === 'then') return (resolve) => Promise.resolve({ data: null, error: null, count: 0 }).then(resolve);
        return (...args) => { rec.calls.push([table, key, ...args]); return q; };
      },
    });
    return q;
  };
  return { supabaseAdmin: { from: (table) => { rec.calls.push([table, 'from']); return chain(table); } } };
});
import * as account from '../../../api/_app/services/account/accountStore.js';
import * as billing from '../../../api/_app/services/billing/billingStore.js';
import * as beta from '../../../api/_app/services/beta/betaStore.js';
import * as calendar from '../../../api/_app/services/calendar/calendarStore.js';
import * as extension from '../../../api/_app/services/extension/extensionStore.js';
import * as channels from '../../../api/_app/services/messagingChannelStore.js';
import * as actions from '../../../api/_app/services/agentActionStore.js';
import * as ops from '../../../api/_app/services/opsStore.js';
import * as consent from '../../../api/_app/services/consentStore.js';
import * as tx from '../../../api/_app/services/transactions/userTransactionStore.js';

const show = (a) => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a));
const chainOf = () => rec.calls.map(([table, op, ...args]) => (op === 'from' ? table : `${op}(${args.map(show).join(', ')})`)).join(' > ');
const reset = () => { rec.calls.length = 0; };

describe('the stores build the chains the routes relied on', () => {
  beforeEach(reset);

  it('account: profile, deletion, and the export reads every table a person lives in', async () => {
    await account.findUserById('u1', 'timezone');
    expect(chainOf()).toBe('users > select(timezone) > eq(id, u1) > single()');
    reset(); await account.deleteUser('u1');
    expect(chainOf()).toBe('users > delete() > eq(id, u1)');
    reset(); const reads = account.exportReads('u1'); await Promise.all(reads);
    const tables = rec.calls.filter(([, op]) => op === 'from').map(([t]) => t);
    expect(reads).toHaveLength(12);
    expect(tables).toEqual(['users', 'platform_connections', 'user_platform_data', 'personality_scores', 'twin_conversations', 'enriched_profiles', 'onboarding_calibration', 'user_memories', 'big_five_scores', 'behavioral_patterns', 'reflection_history', 'privacy_settings']);
    reset(); await account.exportMessages(['c1']);
    expect(chainOf()).toBe('twin_messages > select(conversation_id, role, content, created_at) > in(conversation_id, ["c1"]) > order(created_at, {"ascending":false}) > limit(50000)');
    expect(account.databaseAvailable()).toBe(true);
  });

  it('billing: idempotent webhook events and one subscription row per person', async () => {
    await billing.recordWebhookEvent('evt', 'invoice.paid');
    expect(chainOf()).toBe('stripe_webhook_events > insert({"event_id":"evt","event_type":"invoice.paid"})');
    reset(); await billing.forgetWebhookEvent('evt');
    expect(chainOf()).toBe('stripe_webhook_events > delete() > eq(event_id, evt)');
    reset(); await billing.upsertSubscription({ user_id: 'u1', plan: 'pro' });
    expect(chainOf()).toBe('user_subscriptions > upsert({"user_id":"u1","plan":"pro"}, {"onConflict":"user_id"})');
    reset(); await billing.findSubscriptionByStripeId('sub_1');
    expect(chainOf()).toBe('user_subscriptions > select(user_id) > eq(stripe_subscription_id, sub_1) > single()');
    reset(); await billing.findSubscriptionForUser('u1', 'stripe_customer_id');
    expect(chainOf()).toBe('user_subscriptions > select(stripe_customer_id) > eq(user_id, u1) > single()');
    reset(); await billing.updateSubscriptionForUser('u1', { status: 'past_due' });
    expect(chainOf()).toBe('user_subscriptions > update({"status":"past_due"}) > eq(user_id, u1)');
    reset(); await billing.forgetWebhookEventsBefore('2026-01-01');
    expect(chainOf()).toBe('stripe_webhook_events > delete({"count":"exact"}) > lt(received_at, 2026-01-01) > select(event_id, {"count":"exact"})');
  });

  it('beta: applications by email, the waitlist by address, feedback with its author', async () => {
    await beta.findApplicationByEmail('a@b.c', 'id, status');
    expect(chainOf()).toBe('beta_applications > select(id, status) > eq(email, a@b.c) > single()');
    reset(); await beta.updateApplicationById('app1', { status: 'approved' });
    expect(chainOf()).toBe('beta_applications > update({"status":"approved"}) > eq(id, app1)');
    reset(); await beta.upsertWaitlist({ email: 'a@b.c' });
    expect(chainOf()).toBe('beta_waitlist > upsert({"email":"a@b.c"}, {"onConflict":"email"})');
    reset(); await beta.listFeedbackWithAuthors();
    expect(chainOf()).toBe('beta_feedback > select(*, user:users!beta_feedback_user_id_fkey(id, email, first_name)) > order(created_at, {"ascending":false})');
  });

  it('calendar: events on the person and google id, sync marks on the google_calendar connection', async () => {
    await calendar.upsertCalendarEvent({ user_id: 'u1', google_event_id: 'g1' });
    expect(chainOf()).toBe('calendar_events > upsert({"user_id":"u1","google_event_id":"g1"}, {"onConflict":"user_id,google_event_id"})');
    reset(); await calendar.markCalendarSync('u1', { last_sync_status: 'success' });
    expect(chainOf()).toBe('platform_connections > update({"last_sync_status":"success"}) > eq(user_id, u1) > eq(platform, google_calendar)');
    reset(); await calendar.findCalendarConnection('u1');
    expect(chainOf()).toBe('platform_connections > select(*) > eq(user_id, u1) > eq(platform, google_calendar) > single()');
    reset(); await calendar.disconnectCalendar('u1');
    expect(chainOf()).toBe('platform_connections > update({"connected":false}) > eq(user_id, u1) > eq(platform, google_calendar)');
    reset(); await calendar.deleteCalendarEvents('u1');
    expect(chainOf()).toBe('calendar_events > delete() > eq(user_id, u1)');
  });

  it('extension: captures on the four-column key, web captures since a moment, the digest newest first', async () => {
    await extension.upsertCaptures([{ user_id: 'u1' }]);
    expect(chainOf()).toBe('user_platform_data > upsert([{"user_id":"u1"}], {"onConflict":"user_id,platform,data_type,source_url","ignoreDuplicates":false}) > select(id)');
    reset(); await extension.webCaptures('u1', '2026-09-15', { columns: 'raw_data, data_type' });
    expect(chainOf()).toBe('user_platform_data > select(raw_data, data_type) > eq(user_id, u1) > eq(platform, web) > gte(extracted_at, 2026-09-15) > limit(300)');
    reset(); await extension.webCaptures('u1', '2026-09-15', { columns: 'raw_data', newestFirst: true });
    expect(chainOf()).toBe('user_platform_data > select(raw_data) > eq(user_id, u1) > eq(platform, web) > gte(extracted_at, 2026-09-15) > order(extracted_at, {"ascending":false}) > limit(300)');
    reset(); await extension.deleteExtensionCaptures('u1', 'netflix');
    expect(chainOf()).toBe('user_platform_data > delete() > eq(user_id, u1) > eq(platform, netflix) > like(data_type, extension_%) > select()');
  });

  it('messaging channels: one WhatsApp row per person', async () => {
    await channels.linkWhatsApp('u1', '+34600000000');
    expect(chainOf()).toBe('messaging_channels > upsert({"user_id":"u1","channel":"whatsapp","channel_id":"+34600000000","is_enabled":true}, {"onConflict":"user_id,channel"})');
    reset(); await channels.whatsAppNumber('u1');
    expect(chainOf()).toBe('messaging_channels > select(channel_id) > eq(user_id, u1) > eq(channel, whatsapp) > maybeSingle()');
    reset(); await channels.whatsAppChannels({ limit: 500 });
    expect(chainOf()).toBe('messaging_channels > select(user_id, channel_id) > eq(channel, whatsapp) > limit(500)');
  });

  it('agent actions: stale proposals expire in a counted batch', async () => {
    await actions.staleActions('2026-09-01', { limit: 200 });
    expect(chainOf()).toBe('agent_actions > select(id) > is(user_response, null) > lt(created_at, 2026-09-01) > limit(200)');
    reset(); await actions.expireActions(['a1'], { user_response: 'expired' });
    expect(chainOf()).toBe('agent_actions > update({"user_response":"expired"}, {"count":"exact"}) > in(id, ["a1"])');
  });

  it('operations: probes, the cron ledger, retention', async () => {
    await ops.pingRead();
    expect(chainOf()).toBe('user_memories > select(id) > limit(1)');
    reset(); await ops.llmCallsSince('2026-09-22T00:00:00Z');
    expect(chainOf()).toBe('llm_usage_log > select(*, {"count":"exact","head":true}) > gte(created_at, 2026-09-22T00:00:00Z)');
    reset(); await ops.recentCronExecutions('2026-09-20');
    expect(chainOf()).toBe('cron_executions > select(job_name, status, result_data, executed_at, error_message) > gte(executed_at, 2026-09-20) > order(executed_at, {"ascending":false}) > limit(2000)');
    reset(); await ops.deleteLlmUsageBefore('2026-06-01');
    expect(chainOf()).toBe('llm_usage_log > delete({"count":"exact"}) > lt(created_at, 2026-06-01) > select(created_at, {"count":"exact"})');
    reset(); await ops.whatsAppMemoryCount('u1');
    expect(chainOf()).toBe('user_memories > select(id, {"count":"exact","head":true}) > eq(user_id, u1) > eq(memory_type, platform_data) > like(content, %WhatsApp%)');
  });

  it('consent: one row per person, kind and platform', async () => {
    await consent.grantConsent({ user_id: 'u1', consent_type: 'data', platform: null });
    expect(chainOf()).toBe('user_consents > upsert({"user_id":"u1","consent_type":"data","platform":null}, {"onConflict":"user_id,consent_type,platform"}) > select() > single()');
    reset(); await consent.revokeConsent('u1', 'data', 'spotify', { granted: false });
    expect(chainOf()).toBe('user_consents > update({"granted":false}) > eq(user_id, u1) > eq(consent_type, data) > eq(platform, spotify) > select() > single()');
  });

  it('user transactions: the phone line and the nag', async () => {
    await tx.upsertUserTransactions([{ user_id: 'u1', external_id: 'x' }]);
    expect(chainOf()).toBe('user_transactions > upsert([{"user_id":"u1","external_id":"x"}], {"onConflict":"user_id,external_id","ignoreDuplicates":false}) > select(id)');
    reset(); await tx.usersWithTransactionsSince(['u1'], '2026-09-01');
    expect(chainOf()).toBe('user_transactions > select(user_id) > in(user_id, ["u1"]) > gte(transaction_date, 2026-09-01)');
  });
});
