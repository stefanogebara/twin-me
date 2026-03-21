/**
 * Skills API Routes
 * ==================
 * List and manage available twin skills.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getAvailableSkills, executeSkill, loadSkill } from '../services/skillEngine.js';
import { parseSkillMarkdown, serializeToMarkdown } from '../services/skillMarkdownParser.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('SkillsRoutes');
const router = express.Router();

/**
 * GET /api/skills
 * List all skills available to the current user.
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const skills = await getAvailableSkills(req.user.id);
    return res.json({ success: true, skills });
  } catch (err) {
    log.error('Failed to list skills', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch skills' });
  }
});

/**
 * GET /api/skills/:skillId
 * Get a single skill definition.
 */
router.get('/:skillId', authenticateUser, async (req, res) => {
  try {
    const skill = await loadSkill(req.params.skillId);
    if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
    return res.json({ success: true, skill });
  } catch (err) {
    log.error('Failed to get skill', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch skill' });
  }
});

/**
 * POST /api/skills/:skillId/execute
 * Manually trigger a skill execution.
 */
router.post('/:skillId/execute', authenticateUser, async (req, res) => {
  try {
    const result = await executeSkill(req.user.id, req.params.skillId, req.body.context || {});
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error('Skill execution failed', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Skill execution failed' });
  }
});

/**
 * GET /api/skills/:id/export
 * Export a skill definition as SKILL.md markdown.
 */
router.get('/:id/export', authenticateUser, async (req, res) => {
  try {
    const skill = await loadSkill(req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    const markdown = serializeToMarkdown(skill);
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${skill.name}.skill.md"`);
    return res.send(markdown);
  } catch (err) {
    log.error('Skill export failed', { error: err.message });
    return res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * POST /api/skills/import
 * Import a skill from SKILL.md markdown format.
 * Body: { markdown: "---\nname: ...\n---\n..." }
 */
router.post('/import', authenticateUser, async (req, res) => {
  try {
    const { markdown } = req.body;
    if (!markdown) return res.status(400).json({ error: 'markdown field required' });

    const parsed = parseSkillMarkdown(markdown);
    if (!parsed) return res.status(400).json({ error: 'Invalid SKILL.md format' });

    const { data, error } = await supabaseAdmin
      .from('skill_definitions')
      .upsert({
        ...parsed,
        actions: parsed.actions,
        is_system: false,
      }, { onConflict: 'name' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    log.info('Skill imported', { name: parsed.name, id: data.id });
    return res.json({ success: true, skill: data });
  } catch (err) {
    log.error('Skill import failed', { error: err.message });
    return res.status(500).json({ error: 'Import failed' });
  }
});

export default router;
