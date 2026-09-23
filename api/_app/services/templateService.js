/**
 * Template Service — Life Operating System Templates
 * ====================================================
 * Pre-configured "life operating systems" that set up multiple
 * departments at once. Each template configures autonomy levels
 * and budgets for a specific lifestyle/workflow pattern.
 *
 * Templates are immutable definitions. Applying a template:
 *   1. Sets autonomy + budget for each department in the template
 *   2. Resets departments NOT in the template to OBSERVE (0)
 */

import { DEPARTMENTS } from '../config/departmentConfig.js';
import { createLogger } from './logger.js';

const log = createLogger('TemplateService');

// Lazy-loaded to avoid circular dependencies
const getDepartmentService = () => import('./departmentService.js');
const getDatabase = () => import('./database.js');

// ========================================================================
// Template Definitions
// ========================================================================

export const TEMPLATES = Object.freeze({
  productivity: {
    name: 'Productivity OS',
    description: 'Focus time, email triage, and smart scheduling. Your twin manages your calendar and inbox so you can do deep work.',
    icon: 'zap',
    color: '#F59E0B',
    departments: {
      communications: { autonomy: 3, budget: 0.20 },
      scheduling: { autonomy: 3, budget: 0.15 },
      research: { autonomy: 2, budget: 0.10 },
      health: { autonomy: 1, budget: 0.05 },
    },
    tagline: 'For makers who protect their focus',
  },
  health: {
    name: 'Health OS',
    description: 'Recovery-driven scheduling and wellness nudges. Your twin cross-references Whoop data with your calendar to optimize your energy.',
    icon: 'heart-pulse',
    color: '#EF4444',
    departments: {
      health: { autonomy: 3, budget: 0.15 },
      scheduling: { autonomy: 2, budget: 0.10 },
      research: { autonomy: 1, budget: 0.05 },
    },
    tagline: 'For people who take recovery seriously',
  },
  creator: {
    name: 'Creator OS',
    description: 'Content ideas, drafts, and audience insights. Your twin turns your data patterns into content and manages your online presence.',
    icon: 'pen-line',
    color: '#8B5CF6',
    departments: {
      content: { autonomy: 3, budget: 0.25 },
      communications: { autonomy: 2, budget: 0.15 },
      research: { autonomy: 2, budget: 0.15 },
      social: { autonomy: 1, budget: 0.05 },
    },
    tagline: 'For creators who want to ship more',
  },
  executive: {
    name: 'Executive OS',
    description: 'Full delegation. All departments active at high autonomy. Your twin runs your digital life -- you just approve the big decisions.',
    icon: 'crown',
    color: '#6366F1',
    departments: {
      communications: { autonomy: 3, budget: 0.25 },
      scheduling: { autonomy: 3, budget: 0.20 },
      health: { autonomy: 2, budget: 0.10 },
      content: { autonomy: 2, budget: 0.15 },
      research: { autonomy: 2, budget: 0.15 },
      social: { autonomy: 2, budget: 0.10 },
      finance: { autonomy: 1, budget: 0.05 },
    },
    tagline: 'For leaders who delegate everything',
  },
});

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

// ========================================================================
// Read Operations
// ========================================================================

export function getTemplate(name) {
  return TEMPLATES[name] || null;
}

export function getAllTemplates() {
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    id: key,
    ...t,
    departmentCount: Object.keys(t.departments).length,
    totalBudget: Object.values(t.departments).reduce((sum, d) => sum + d.budget, 0),
  }));
}

// ========================================================================
// Apply Template
// ========================================================================

export async function applyTemplate(userId, templateName) {
  const template = TEMPLATES[templateName];
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`);
  }

  const { updateDepartmentAutonomy } = await getDepartmentService();
  const { supabaseAdmin } = await getDatabase();
  const results = [];

  for (const [deptName, config] of Object.entries(template.departments)) {
    try {
      await updateDepartmentAutonomy(userId, deptName, config.autonomy);

      await supabaseAdmin
        .from('department_budgets')
        .upsert({
          user_id: userId,
          department: deptName,
          monthly_budget_usd: config.budget,
        }, { onConflict: 'user_id,department' });

      results.push({
        department: deptName,
        autonomy: config.autonomy,
        budget: config.budget,
        success: true,
      });
    } catch (err) {
      log.error('Failed to apply template department', {
        userId,
        template: templateName,
        department: deptName,
        error: err.message,
      });
      results.push({ department: deptName, success: false, error: err.message });
    }
  }

  // Reset departments NOT in this template to OBSERVE (0)
  for (const deptName of Object.keys(DEPARTMENTS)) {
    if (!template.departments[deptName]) {
      try {
        await updateDepartmentAutonomy(userId, deptName, 0);
      } catch {
        // Non-critical: log but don't fail the whole operation
      }
    }
  }

  log.info('Template applied', {
    userId,
    template: templateName,
    successCount: results.filter(r => r.success).length,
    totalCount: results.length,
  });

  return { template: templateName, departments: results };
}
