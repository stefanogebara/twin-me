/**
 * Template API Routes — Life Operating System Templates
 * ======================================================
 * Endpoints for listing and applying pre-configured department
 * templates ("Life Operating Systems") that configure multiple
 * departments in one click.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { TEMPLATE_NAMES } from '../services/templateService.js';
import { createLogger } from '../services/logger.js';

// Lazy-loaded to avoid circular dependencies
const getTemplateService = () => import('../services/templateService.js');

const log = createLogger('TemplateRoutes');
const router = express.Router();

// ========================================================================
// Param validation helper
// ========================================================================

function validateTemplateName(name) {
  return TEMPLATE_NAMES.includes(name);
}

// ========================================================================
// GET /api/templates — List all templates
// ========================================================================

router.get('/', authenticateUser, async (req, res) => {
  try {
    const { getAllTemplates } = await getTemplateService();
    const templates = getAllTemplates();
    return res.json({ success: true, templates });
  } catch (err) {
    log.error('Failed to list templates', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

// ========================================================================
// GET /api/templates/:name — Single template detail
// ========================================================================

router.get('/:name', authenticateUser, async (req, res) => {
  try {
    const { name } = req.params;

    if (!validateTemplateName(name)) {
      return res.status(400).json({ success: false, error: `Unknown template: ${name}` });
    }

    const { getTemplate } = await getTemplateService();
    const template = getTemplate(name);
    return res.json({ success: true, template: { id: name, ...template } });
  } catch (err) {
    log.error('Failed to get template detail', { userId: req.user.id, template: req.params.name, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch template' });
  }
});

// ========================================================================
// POST /api/templates/:name/apply — Apply template to user's departments
// ========================================================================

router.post('/:name/apply', authenticateUser, async (req, res) => {
  try {
    const { name } = req.params;

    if (!validateTemplateName(name)) {
      return res.status(400).json({ success: false, error: `Unknown template: ${name}` });
    }

    const { applyTemplate } = await getTemplateService();
    const result = await applyTemplate(req.user.id, name);
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error('Failed to apply template', { userId: req.user.id, template: req.params.name, error: err.message });
    return res.status(500).json({ success: false, error: err.message || 'Failed to apply template' });
  }
});

export default router;
