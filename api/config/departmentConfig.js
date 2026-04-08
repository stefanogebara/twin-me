/**
 * Department Configuration — SoulOS Department Definitions
 * =========================================================
 * Frozen configuration for the 7 SoulOS departments.
 * Each department groups related skills, tools, and platform
 * integrations under a single controllable unit with its own
 * autonomy level and monthly LLM budget.
 *
 * Autonomy levels (from autonomyService.js):
 *   0 = OBSERVE    — Twin watches, learns, never acts
 *   1 = SUGGEST    — Twin suggests actions in chat
 *   2 = DRAFT      — Twin prepares actions, waits for approval
 *   3 = ACT_NOTIFY — Twin acts, then notifies what it did
 *   4 = AUTONOMOUS — Twin acts silently, surfaces outcomes only
 */

export const DEPARTMENTS = Object.freeze({
  communications: {
    name: 'Communications',
    description: 'Drafts and sends emails in your voice, manages inbox priorities',
    icon: 'mail',
    defaultAutonomy: 2,
    defaultMonthlyBudget: 0.15,
    platforms: ['gmail'],
    tools: ['gmail_send', 'gmail_reply', 'gmail_draft'],
    llmTier: 'TIER_ANALYSIS',
    color: '#3B82F6',
  },
  scheduling: {
    name: 'Scheduling',
    description: 'Optimizes your calendar, suggests focus time, manages events',
    icon: 'calendar',
    defaultAutonomy: 2,
    defaultMonthlyBudget: 0.10,
    platforms: ['calendar'],
    tools: ['calendar_create', 'calendar_modify_event'],
    llmTier: 'TIER_EXTRACTION',
    color: '#8B5CF6',
  },
  health: {
    name: 'Health',
    description: 'Analyzes recovery, sleep, strain patterns from Whoop data',
    icon: 'heart-pulse',
    defaultAutonomy: 1,
    defaultMonthlyBudget: 0.05,
    platforms: ['whoop'],
    tools: [],
    llmTier: 'TIER_EXTRACTION',
    color: '#EF4444',
  },
  content: {
    name: 'Content',
    description: 'Creates social posts, blog drafts, and professional updates in your style',
    icon: 'pen-line',
    defaultAutonomy: 2,
    defaultMonthlyBudget: 0.10,
    platforms: ['youtube', 'linkedin', 'reddit'],
    tools: ['docs_create'],
    llmTier: 'TIER_ANALYSIS',
    color: '#F59E0B',
  },
  finance: {
    name: 'Finance',
    description: 'Tracks spending patterns, budget alerts, investment research',
    icon: 'wallet',
    defaultAutonomy: 0,
    defaultMonthlyBudget: 0.05,
    platforms: [],
    tools: [],
    llmTier: 'TIER_EXTRACTION',
    color: '#10B981',
  },
  research: {
    name: 'Research',
    description: 'Deep research on topics you care about, summarizes articles and papers',
    icon: 'search',
    defaultAutonomy: 1,
    defaultMonthlyBudget: 0.10,
    platforms: ['github', 'reddit'],
    tools: ['drive_search'],
    llmTier: 'TIER_ANALYSIS',
    color: '#6366F1',
  },
  social: {
    name: 'Social',
    description: 'Maintains relationships, suggests catch-ups, remembers important dates',
    icon: 'users',
    defaultAutonomy: 1,
    defaultMonthlyBudget: 0.05,
    platforms: ['discord', 'linkedin'],
    tools: [],
    llmTier: 'TIER_EXTRACTION',
    color: '#EC4899',
  },
});

export const DEPARTMENT_NAMES = Object.keys(DEPARTMENTS);

export const getDepartmentConfig = (name) => DEPARTMENTS[name] || null;

// Per-tool cost estimates in USD (based on LLM tier pricing)
export const TOOL_COST_ESTIMATES = Object.freeze({
  gmail_send: 0.005,
  gmail_reply: 0.005,
  gmail_draft: 0.003,
  calendar_create: 0.002,
  calendar_modify_event: 0.002,
  docs_create: 0.008,
  drive_search: 0.001,
  suggest: 0.001,
});

export function getToolCostEstimate(toolName) {
  return TOOL_COST_ESTIMATES[toolName] ?? 0.003;
}
