/**
 * One payment, one line, however the bank spells its name.
 * =======================================================
 * A card payment reaches the feed three times: pending, booked with no reference of its own,
 * and booked with the reference the bank finally hands out. Each spelling is a different
 * source_ref, and a source_ref the ledger does not recognise opens a new line. On the real
 * account one El Corte Ingles payment of 134,62 EUR became three lines that way, and the
 * pull at 02:00 on 2026-09-18 added five more copies of payments already held.
 *
 * The three spellings are all computed from the same fingerprint, so a later reading can
 * recognise an earlier one if it carries the earlier names with it.
 */
import { describe, expect, it } from 'vitest';
import { toSighting, distinctPending } from '../../../../api/services/money/feeds/enableBanking.js';
import { planIngestion } from '../../../../api/services/money/ingestion.js';

/** What prepare_money_ingestion hands the planner (migration 20260917000200). */
function snapshotFor(inputs, store) {
  const wanted = new Set();
  for (const i of inputs) {
    wanted.add(`${i.source}:${i.source_ref}`);
    for (const ref of i.legacy_refs || []) wanted.add(`${i.source}:${ref}`);
  }
  return {
    revision: 1,
    sightings: store.sightings.filter((s) => wanted.has(`${s.source}:${s.source_ref}`)),
    transactions: store.transactions.map((t) => ({
      ...t,
      backings: store.sightings.filter((s) => s.transaction_id === t.id)
        .map((s) => ({ id: s.id, source: s.source, status: s.raw_json?.status || 'BOOK' })),
    })),
  };
}

/** What commit_money_ingestion writes back. */
function commit(store, plan) {
  for (const s of plan.sightings) {
    const link = plan.links.find((l) => l.sighting_id === s.id);
    const row = { ...s, transaction_id: link ? link.transaction_id : null };
    const at = store.sightings.findIndex((x) => x.id === s.id);
    if (at >= 0) store.sightings[at] = row; else store.sightings.push(row);
  }
  for (const t of plan.creates) store.transactions.push({ ...t, backings: undefined });
  for (const u of plan.updates) Object.assign(store.transactions.find((t) => t.id === u.id) || {}, u);
}

function read(store, rows) {
  const inputs = distinctPending(rows.map((r) => toSighting(r, 'acc-1')));
  const plan = planIngestion(inputs, snapshotFor(inputs, store));
  commit(store, plan);
  return plan;
}

const CARD = {
  transaction_amount: { amount: '134.62', currency: 'EUR' },
  credit_debit_indicator: 'DBIT',
  value_date: '2026-09-15',
  remittance_information: ['PAGO MOVIL EN EL CORTE INGLES, MADRID ES'],
};

describe('a payment the bank renames', () => {
  it('keeps one line from pending to booked to referenced', () => {
    const store = { sightings: [], transactions: [] };
    read(store, [{ ...CARD, status: 'PDNG' }]);
    expect(store.transactions).toHaveLength(1);
    /* The bank books it, but this reading carries no reference of its own. */
    read(store, [{ ...CARD }]);
    expect(store.transactions).toHaveLength(1);
    /* The next reading has the bank's reference, and it is a different name for the same
       payment, not a second payment. */
    read(store, [{ ...CARD, entry_reference: '2026-09-15.1' }]);
    expect(store.transactions).toHaveLength(1);
    expect(store.transactions[0].posted_at).toBeTruthy();
  });

  it('still keeps two payments apart when the shop and the price are the same', () => {
    const store = { sightings: [], transactions: [] };
    read(store, [{ ...CARD, entry_reference: '2026-09-15.1' }, { ...CARD, entry_reference: '2026-09-15.2' }]);
    expect(store.transactions).toHaveLength(2);
    /* Read again: the same two payments, not four. */
    read(store, [{ ...CARD, entry_reference: '2026-09-15.1' }, { ...CARD, entry_reference: '2026-09-15.2' }]);
    expect(store.transactions).toHaveLength(2);
  });

  /* Two coffees at one price on one day are two payments. Each booked reading now carries the
     names the pending readings used, and those names are shared, so a name may only be
     claimed once: without that, both bookings would take the same evidence row and one
     payment would vanish in the write. */
  it('does not let two payments claim the same earlier name', () => {
    const store = { sightings: [], transactions: [] };
    read(store, [{ ...CARD, status: 'PDNG' }, { ...CARD, status: 'PDNG' }]);
    expect(store.transactions).toHaveLength(2);
    const plan = read(store, [{ ...CARD, entry_reference: '2026-09-15.1' }, { ...CARD, entry_reference: '2026-09-15.2' }]);
    /* Two rows written to one id is a payment lost: Postgres keeps the last one. */
    expect(new Set(plan.sightings.map((x) => x.id)).size).toBe(plan.sightings.length);
    expect(new Set(plan.links.map((l) => l.transaction_id)).size).toBe(2);
    expect(store.transactions).toHaveLength(2);
  });

  it('carries every earlier name, and no more names than the ledger accepts', () => {
    const s = toSighting({ ...CARD, entry_reference: 'E9', transaction_id: 'T9' }, 'acc-1');
    const pending = toSighting({ ...CARD, status: 'PDNG' }, 'acc-1');
    const fallback = toSighting({ ...CARD }, 'acc-1');
    expect(s.legacy_refs).toContain(fallback.source_ref);
    expect(s.legacy_refs).toContain(pending.source_ref);
    expect(s.legacy_refs).toContain('E9');
    expect(s.legacy_refs.length).toBeLessThanOrEqual(5);
    expect(s.legacy_refs.every((r) => r.length <= 512)).toBe(true);
  });
});
