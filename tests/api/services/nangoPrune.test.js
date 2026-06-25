/**
 * selectConnectionsToPrune — the load-bearing selector behind dedup-on-connect.
 * Must prune ONLY same-user + same-platform duplicates, never the kept
 * connection, never another user's, never another platform's.
 */
import { describe, it, expect } from 'vitest';
import { selectConnectionsToPrune } from '../../../api/services/nangoService.js';

const conns = [
  { connection_id: 'keep-1', provider_config_key: 'whoop', end_user: { id: 'userA' } },   // the new one → keep
  { connection_id: 'old-1', provider_config_key: 'whoop', end_user: { id: 'userA' } },     // dupe → prune
  { connection_id: 'old-2', provider_config_key: 'whoop', end_user: { id: 'userA' } },     // dupe → prune
  { connection_id: 'other-user', provider_config_key: 'whoop', end_user: { id: 'userB' } },// another user → keep
  { connection_id: 'other-plat', provider_config_key: 'outlook', end_user: { id: 'userA' } }, // another platform → keep
];

describe('selectConnectionsToPrune', () => {
  it('selects only the same-user same-platform duplicates, excluding the kept one', () => {
    const pruned = selectConnectionsToPrune(conns, 'userA', 'whoop', 'keep-1');
    expect(pruned.map(c => c.connectionId).sort()).toEqual(['old-1', 'old-2']);
  });

  it('never includes the kept connection, another user, or another platform', () => {
    const ids = selectConnectionsToPrune(conns, 'userA', 'whoop', 'keep-1').map(c => c.connectionId);
    expect(ids).not.toContain('keep-1');
    expect(ids).not.toContain('other-user');
    expect(ids).not.toContain('other-plat');
  });

  it('returns empty when there are no duplicates', () => {
    expect(selectConnectionsToPrune(conns, 'userA', 'outlook', 'other-plat')).toEqual([]);
    expect(selectConnectionsToPrune([], 'userA', 'whoop', 'keep-1')).toEqual([]);
  });

  it('carries the providerConfigKey through for the raw delete', () => {
    const pruned = selectConnectionsToPrune(conns, 'userA', 'whoop', 'keep-1');
    expect(pruned.every(c => c.providerConfigKey === 'whoop')).toBe(true);
  });
});
