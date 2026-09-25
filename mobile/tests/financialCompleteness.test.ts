import { expect, it, vi } from 'vitest';
vi.mock('../src/services/api', () => ({ authFetch: vi.fn() }));
vi.mock('../src/constants', () => ({ API_URL: '/api', STORAGE_KEYS: {} }));
vi.mock('expo-secure-store', () => ({}));
import { consistentGuidance, usableForecast } from '../src/services/moneyApi';
const clear={state:'clear' as const,unresolvedCount:0,revision:1,financialRevision:4};
it('does not combine two individually clear responses from different financial revisions',()=>{
 expect(consistentGuidance({reconciliation:clear},{reconciliation:{...clear,financialRevision:5}})).toBe(false);
 expect(consistentGuidance({reconciliation:clear},{reconciliation:clear})).toBe(true);
});
it('withholds both surfaces if either response is pending or missing',()=>{
 expect(consistentGuidance({reconciliation:clear},{reconciliation:{...clear,state:'pending'}})).toBe(false);
 expect(consistentGuidance({reconciliation:clear},null)).toBe(false);
});
it('a withheld or null figure is never a valid zero forecast',()=>{
 const forecast={spent:0,committed:0,projected_p10:0,projected_p50:0,projected_p90:0} as Parameters<typeof usableForecast>[0];
 expect(usableForecast(forecast)).toBe(true);
 expect(usableForecast({...forecast!,withheld:true})).toBe(false);
 expect(usableForecast({...forecast!,projected_p50:null})).toBe(false);
});
