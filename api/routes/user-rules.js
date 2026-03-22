/**
 * User Rules — Explicit Instructions the Twin Must Always Obey
 * ==============================================================
 * Users can tell the twin "remember: I'm vegan" or "never mention my ex".
 * Rules are stored in the `user_rules` core memory block and injected
 * into every system prompt with high priority.
 *
 * GET  /api/user-rules          — list current rules
 * POST /api/user-rules          — add a rule { rule: "..." }
 * DELETE /api/user-rules/:index — remove a rule by index (0-based)
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getBlocks, updateBlock } from '../services/coreMemoryService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('UserRules');
const router = express.Router();

const MAX_RULES = 20;
const MAX_RULE_LENGTH = 120;

function parseRules(content) {
  if (!content || !content.trim()) return [];
  return content.split('\n').filter(line => line.trim().length > 0);
}

function serializeRules(rules) {
  return rules.join('\n');
}

// GET — list current rules
router.get('/', authenticateUser, async (req, res) => {
  try {
    const blocks = await getBlocks(req.user.id);
    const rules = parseRules(blocks.user_rules?.content);
    return res.json({ rules, count: rules.length, maxRules: MAX_RULES });
  } catch (err) {
    log.error('Failed to fetch rules', { error: err.message });
    return res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// POST — add a rule
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { rule } = req.body;
    if (!rule || typeof rule !== 'string' || rule.trim().length < 3) {
      return res.status(400).json({ error: 'Rule must be at least 3 characters' });
    }

    const cleanRule = rule.trim().slice(0, MAX_RULE_LENGTH);
    const blocks = await getBlocks(req.user.id);
    const rules = parseRules(blocks.user_rules?.content);

    if (rules.length >= MAX_RULES) {
      return res.status(400).json({ error: `Maximum ${MAX_RULES} rules reached. Remove one first.` });
    }

    // Check for duplicates (case-insensitive)
    if (rules.some(r => r.toLowerCase() === cleanRule.toLowerCase())) {
      return res.status(409).json({ error: 'Rule already exists' });
    }

    rules.push(cleanRule);
    await updateBlock(req.user.id, 'user_rules', serializeRules(rules), 'user');

    log.info('Rule added', { userId: req.user.id, rule: cleanRule });
    return res.json({ success: true, rules, count: rules.length });
  } catch (err) {
    log.error('Failed to add rule', { error: err.message });
    return res.status(500).json({ error: 'Failed to add rule' });
  }
});

// DELETE — remove a rule by index
router.delete('/:index', authenticateUser, async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const blocks = await getBlocks(req.user.id);
    const rules = parseRules(blocks.user_rules?.content);

    if (isNaN(index) || index < 0 || index >= rules.length) {
      return res.status(400).json({ error: `Invalid index. Valid range: 0-${rules.length - 1}` });
    }

    const removed = rules.splice(index, 1)[0];
    await updateBlock(req.user.id, 'user_rules', serializeRules(rules), 'user');

    log.info('Rule removed', { userId: req.user.id, removed });
    return res.json({ success: true, removed, rules, count: rules.length });
  } catch (err) {
    log.error('Failed to remove rule', { error: err.message });
    return res.status(500).json({ error: 'Failed to remove rule' });
  }
});

export default router;
