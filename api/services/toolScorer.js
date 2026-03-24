/**
 * Tool Scorer — Relevance Scoring for Context Router
 * ====================================================
 * Scores each tool's relevance to a task description using
 * keyword matching, platform matching, and category matching.
 *
 * Returns 0.0-1.0 relevance score per tool. Used by contextRouter.js
 * to filter 37+ tools down to the 5-8 most relevant per request.
 */

// Platform keyword maps — each platform's trigger words
const PLATFORM_KEYWORDS = {
  spotify: ['music', 'song', 'playlist', 'listening', 'track', 'artist', 'spotify', 'album', 'genre', 'playing', 'listen', 'tune', 'beats'],
  google_calendar: ['calendar', 'event', 'meeting', 'schedule', 'busy', 'free', 'invite', 'appointment', 'when', 'today', 'tomorrow', 'week'],
  google_gmail: ['email', 'gmail', 'inbox', 'send', 'reply', 'draft', 'message', 'mail', 'compose', 'forward', 'subject'],
  google_drive: ['drive', 'file', 'document', 'folder', 'search files', 'find document', 'upload', 'download', 'storage'],
  google_docs: ['doc', 'document', 'write', 'create document', 'google doc', 'edit document', 'docs'],
  google_sheets: ['spreadsheet', 'sheet', 'cells', 'data', 'table', 'csv', 'rows', 'columns'],
  whoop: ['whoop', 'recovery', 'sleep', 'hrv', 'strain', 'health', 'energy', 'heart rate', 'biometrics', 'workout'],
  youtube: ['youtube', 'video', 'watch', 'channel', 'subscribe', 'stream', 'content'],
  github: ['github', 'repo', 'pr', 'pull request', 'code', 'commit', 'branch', 'repository', 'coding'],
  discord: ['discord', 'server', 'channel', 'community', 'chat room', 'gaming'],
  linkedin: ['linkedin', 'career', 'job', 'professional', 'network', 'resume', 'work history'],
  reddit: ['reddit', 'subreddit', 'post', 'upvote', 'thread', 'community'],
  twitch: ['twitch', 'stream', 'gaming', 'live', 'broadcaster', 'viewer'],
};

// Category keyword maps — broader functional categories
const CATEGORY_KEYWORDS = {
  communication: ['email', 'message', 'send', 'reply', 'contact', 'reach out', 'write to', 'respond', 'draft', 'compose'],
  schedule: ['calendar', 'event', 'meeting', 'schedule', 'time', 'when', 'busy', 'free', 'appointment', 'today', 'tomorrow'],
  productivity: ['document', 'file', 'sheet', 'draft', 'create', 'write', 'edit', 'spreadsheet', 'organize', 'task'],
  music: ['music', 'song', 'playlist', 'listen', 'playing', 'track', 'artist', 'album', 'genre'],
  health: ['health', 'sleep', 'recovery', 'exercise', 'energy', 'workout', 'hrv', 'strain', 'biometrics'],
  social: ['social', 'community', 'friends', 'people', 'chat', 'server', 'channel', 'post'],
  content: ['video', 'watch', 'stream', 'content', 'channel', 'subscribe', 'youtube'],
  memory: ['remember', 'recall', 'memory', 'forgot', 'what did', 'search', 'find', 'look up', 'know about'],
  career: ['career', 'job', 'professional', 'work', 'resume', 'linkedin', 'network'],
  entertainment: ['game', 'gaming', 'twitch', 'stream', 'play', 'fun'],
  data: ['data', 'recent', 'activity', 'history', 'patterns', 'analytics'],
};

/**
 * Tokenize a string into lowercase words for matching.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Count how many keywords from a keyword list appear in the text.
 * Supports multi-word keywords (phrase matching).
 *
 * @param {string} textLower - Lowercased text to search in
 * @param {string[]} keywords - Keywords to look for
 * @returns {number} Count of matched keywords
 */
function countKeywordMatches(textLower, keywords) {
  let count = 0;
  for (const kw of keywords) {
    if (textLower.includes(kw)) {
      // Longer keywords are more specific, give a slight boost
      count += kw.length > 6 ? 1.3 : 1.0;
    }
  }
  return count;
}

/**
 * Score a tool's relevance to a task description.
 *
 * Scoring factors:
 *   1. Platform keyword match (0-0.5): does the task mention this tool's platform?
 *   2. Category keyword match (0-0.3): does the task match this tool's category?
 *   3. Direct name match (0-0.2): does the task mention the tool name?
 *
 * @param {object} tool - Tool object with { name, platform, description, category }
 * @param {string} taskDescription - The user's task description
 * @returns {number} Relevance score 0.0-1.0
 */
export function scoreToolRelevance(tool, taskDescription) {
  if (!tool || !taskDescription) return 0;

  const taskLower = taskDescription.toLowerCase();
  const taskTokens = tokenize(taskDescription);

  let score = 0;

  // 1. Platform keyword matching (max 0.5)
  if (tool.platform) {
    const platformKws = PLATFORM_KEYWORDS[tool.platform];
    if (platformKws) {
      const matches = countKeywordMatches(taskLower, platformKws);
      // Normalize: 2+ matches = full platform score
      score += Math.min(0.5, matches * 0.25);
    }
  }

  // 2. Category keyword matching (max 0.3)
  if (tool.category) {
    const categoryKws = CATEGORY_KEYWORDS[tool.category];
    if (categoryKws) {
      const matches = countKeywordMatches(taskLower, categoryKws);
      score += Math.min(0.3, matches * 0.15);
    }
  }

  // 3. Direct tool name/description overlap (max 0.2)
  const toolNameTokens = tokenize(tool.name);
  const toolDescTokens = tokenize(tool.description);
  const allToolTokens = new Set([...toolNameTokens, ...toolDescTokens]);

  let nameOverlap = 0;
  for (const token of taskTokens) {
    if (token.length >= 3 && allToolTokens.has(token)) {
      nameOverlap += 1;
    }
  }
  score += Math.min(0.2, nameOverlap * 0.07);

  return Math.min(1.0, score);
}

/**
 * Score all tools and return them sorted by relevance.
 *
 * @param {object[]} tools - Array of tool objects
 * @param {string} taskDescription - The task to score against
 * @param {number} topK - Maximum number of tools to return (default: 8)
 * @returns {object[]} Top tools with relevance scores attached
 */
export function scoreAndRankTools(tools, taskDescription, topK = 8) {
  if (!tools || tools.length === 0) return [];
  if (!taskDescription) return tools.slice(0, topK);

  const scored = tools.map(tool => ({
    ...tool,
    relevanceScore: scoreToolRelevance(tool, taskDescription),
  }));

  // Sort by relevance descending
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Always include tools with score > 0, up to topK
  // Also include "always useful" tools (memory tools) with a minimum score
  const ALWAYS_INCLUDE_CATEGORIES = new Set(['memory']);
  const results = [];
  const seen = new Set();

  // First pass: add all scored tools
  for (const tool of scored) {
    if (results.length >= topK) break;
    if (tool.relevanceScore > 0) {
      results.push(tool);
      seen.add(tool.name);
    }
  }

  // Second pass: ensure memory tools are included (always useful for agent)
  if (results.length < topK) {
    for (const tool of scored) {
      if (results.length >= topK) break;
      if (!seen.has(tool.name) && ALWAYS_INCLUDE_CATEGORIES.has(tool.category)) {
        results.push({ ...tool, relevanceScore: 0.05 });
        seen.add(tool.name);
      }
    }
  }

  // If we still have no results, return generic platform data tool + memory tools
  if (results.length === 0) {
    const fallbacks = scored.filter(t =>
      t.name === 'get_platform_data' || t.category === 'memory'
    ).slice(0, 3);
    return fallbacks.map(t => ({ ...t, relevanceScore: 0.1 }));
  }

  return results;
}

export { PLATFORM_KEYWORDS, CATEGORY_KEYWORDS };
