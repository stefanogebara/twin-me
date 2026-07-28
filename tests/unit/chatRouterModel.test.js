import { describe, it, expect } from 'vitest';
import {
  CHAT_TIER_MODELS,
  CHAT_TIER_LIGHT,
  CHAT_TIER_STANDARD,
  CHAT_TIER_DEEP,
} from '../../api/services/chatRouter.js';

// Drift guard (audit #118): CHAT_TIER_MODELS is the documented source of truth for
// which model each chat tier uses. A commit labelled "lint cleanup" once silently
// swapped DEEP from Claude Sonnet to DeepSeek with no doc update, so the docs and
// code disagreed for months. These pin the mapping so any future model change is
// deliberate and forces the docs (chatRouter header, aiModels.js, CLAUDE.md) to match.
describe('CHAT_TIER_MODELS drift guard', () => {
  it('maps each chat tier to its documented model', () => {
    expect(CHAT_TIER_MODELS[CHAT_TIER_LIGHT]).toBe('google/gemini-2.5-flash');
    expect(CHAT_TIER_MODELS[CHAT_TIER_STANDARD]).toBe('deepseek/deepseek-v3.2');
    expect(CHAT_TIER_MODELS[CHAT_TIER_DEEP]).toBe('deepseek/deepseek-v3.2');
  });
});
