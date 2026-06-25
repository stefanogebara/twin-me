/**
 * place_call tool — must be a WRITE tool (always queued for yes/skip approval,
 * never fired inline) and its executor delegates to callService.placeCall with
 * the right shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const placeCallMock = vi.fn();
vi.mock('../../../api/services/callService.js', () => ({ placeCall: (...a) => placeCallMock(...a) }));
// Avoid Redis in the executeTool idempotency path.
vi.mock('../../../api/services/redisClient.js', () => ({ get: async () => null, set: async () => {} }));

const { executeTool } = await import('../../../api/services/toolRegistry.js');
const { registerExtendedTools, EXTENDED_TOOL_NAMES } = await import('../../../api/services/tools/extendedTools.js');
const { isWriteTool } = await import('../../../api/services/tools/workspaceActionParser.js');
registerExtendedTools();

beforeEach(() => {
  placeCallMock.mockReset();
  placeCallMock.mockResolvedValue({ success: true, callId: 'c1', status: 'dialing' });
});

describe('place_call tool', () => {
  it('is registered in EXTENDED_TOOL_NAMES', () => {
    expect(EXTENDED_TOOL_NAMES).toContain('place_call');
  });

  it('is a WRITE tool — forced through approval, never inline', () => {
    expect(isWriteTool('place_call')).toBe(true);
  });

  it('executor delegates to callService.placeCall with toNumber/toName/goal', async () => {
    const out = await executeTool('u1', 'place_call', { to: '+5511988887777', to_name: 'Dentist', goal: 'book a cleaning' }, { bypassAutonomy: true });
    expect(out.success).toBe(true);
    expect(out.data).toMatchObject({ success: true, callId: 'c1' });
    expect(placeCallMock).toHaveBeenCalledWith('u1', { toNumber: '+5511988887777', toName: 'Dentist', goal: 'book a cleaning' });
  });
});
