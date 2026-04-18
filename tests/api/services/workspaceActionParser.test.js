import { describe, it } from 'vitest';

// NOTE: `api/services/workspaceActionParser.js` does not exist in the codebase.
// The closest module is `googleWorkspaceActions.js`, which is a thin API client
// wrapper (not an action-block parser). Skipping this test file until a parser
// module is introduced.
describe.skip('workspaceActionParser', () => {
  it('(skipped — module not implemented)', () => {});
});
