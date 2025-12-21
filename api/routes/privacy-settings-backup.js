/**
 * Privacy Settings API Routes
 *
 * Handles CRUD operations for user privacy settings including:
 * - Global privacy levels
 * - Life cluster configurations
 * - Audience-specific settings
 * - Privacy templates
 * - Import/export functionality
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/privacy-settings
 * Get user's current privacy settings
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch privacy settings from database
    const { data: settings, error } = await supabase
      .from('privacy_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found, which is ok for new users
      throw error;
    }

    // Return default settings if none exist
    if (!settings) {
      return res.json({
        globalPrivacy: 50,
        selectedAudienceId: 'social',
        selectedTemplateId: null,
        clusters: [],
        audienceSpecificSettings: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching privacy settings:', error);
    res.status(500).json({
      error: 'Failed to fetch privacy settings',
      details: error.message
    });
  }
});

/**
 * PUT /api/privacy-settings
 * Update user's privacy settings
 */
router.put('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      globalPrivacy,
      selectedAudienceId,
      selectedTemplateId,
      clusters,
      audienceSpecificSettings
    } = req.body;

    // Validate input
    if (globalPrivacy < 0 || globalPrivacy > 100) {
      return res.status(400).json({
        error: 'Invalid global privacy value. Must be between 0 and 100.'
      });
    }

    const settingsData = {
      user_id: userId,
      global_privacy: globalPrivacy,
      selected_audience_id: selectedAudienceId,
      selected_template_id: selectedTemplateId,
      clusters: clusters || [],
      audience_specific_settings: audienceSpecificSettings || {},
      updated_at: new Date().toISOString()
    };

    // Upsert privacy settings
    const { data, error } = await supabase
      .from('privacy_settings')
      .upsert(settingsData, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) throw error;

    // Log privacy change for audit trail
    await supabase.from('privacy_audit_log').insert({
      user_id: userId,
      action: 'update_settings',
      previous_global_privacy: globalPrivacy,
      new_global_privacy: globalPrivacy,
      changed_at: new Date().toISOString()
    });

    res.json({
      success: true,
      settings: data,
      message: 'Privacy settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({
      error: 'Failed to update privacy settings',
      details: error.message
    });
  }
});

/**
 * GET /api/privacy-settings/templates
 * Get user's custom privacy templates
 */
router.get('/templates', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: templates, error } = await supabase
      .from('privacy_templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(templates || []);
  } catch (error) {
    console.error('Error fetching privacy templates:', error);
    res.status(500).json({
      error: 'Failed to fetch privacy templates',
      details: error.message
    });
  }
});

/**
 * POST /api/privacy-settings/templates
 * Create a new custom privacy template
 */
router.post('/templates', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, settings, icon, color } = req.body;

    // Validate input
    if (!name || !settings) {
      return res.status(400).json({
        error: 'Template name and settings are required'
      });
    }

    const templateData = {
      user_id: userId,
      name,
      description: description || '',
      settings,
      icon: icon || 'Shield',
      color: color || '#8B5CF6',
      is_custom: true,
      usage_count: 0,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('privacy_templates')
      .insert(templateData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      template: data,
      message: 'Privacy template created successfully'
    });
  } catch (error) {
    console.error('Error creating privacy template:', error);
    res.status(500).json({
      error: 'Failed to create privacy template',
      details: error.message
    });
  }
});

/**
 * PUT /api/privacy-settings/templates/:id
 * Update a custom privacy template
 */
router.put('/templates/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const templateId = req.params.id;
    const { name, description, settings, icon, color } = req.body;

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('privacy_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        error: 'Template not found or access denied'
      });
    }

    const updateData = {
      name: name || existing.name,
      description: description || existing.description,
      settings: settings || existing.settings,
      icon: icon || existing.icon,
      color: color || existing.color,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('privacy_templates')
      .update(updateData)
      .eq('id', templateId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      template: data,
      message: 'Privacy template updated successfully'
    });
  } catch (error) {
    console.error('Error updating privacy template:', error);
    res.status(500).json({
      error: 'Failed to update privacy template',
      details: error.message
    });
  }
});

/**
 * DELETE /api/privacy-settings/templates/:id
 * Delete a custom privacy template
 */
router.delete('/templates/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const templateId = req.params.id;

    // Verify ownership and that it's a custom template
    const { data: existing, error: fetchError } = await supabase
      .from('privacy_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', userId)
      .eq('is_custom', true)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        error: 'Template not found, access denied, or cannot delete default template'
      });
    }

    const { error } = await supabase
      .from('privacy_templates')
      .delete()
      .eq('id', templateId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Privacy template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting privacy template:', error);
    res.status(500).json({
      error: 'Failed to delete privacy template',
      details: error.message
    });
  }
});

/**
 * POST /api/privacy-settings/templates/:id/apply
 * Apply a template and track usage
 */
router.post('/templates/:id/apply', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const templateId = req.params.id;

    // Get template
    const { data: template, error: fetchError } = await supabase
      .from('privacy_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (fetchError || !template) {
      return res.status(404).json({
        error: 'Template not found'
      });
    }

    // Update usage stats
    await supabase
      .from('privacy_templates')
      .update({
        usage_count: (template.usage_count || 0) + 1,
        last_used: new Date().toISOString()
      })
      .eq('id', templateId);

    // Apply template settings to user's privacy settings
    const { error: updateError } = await supabase
      .from('privacy_settings')
      .upsert({
        user_id: userId,
        global_privacy: template.settings.globalPrivacy,
        selected_template_id: templateId,
        clusters: template.settings.clusterSettings || [],
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (updateError) throw updateError;

    res.json({
      success: true,
      template,
      message: `Template "${template.name}" applied successfully`
    });
  } catch (error) {
    console.error('Error applying privacy template:', error);
    res.status(500).json({
      error: 'Failed to apply privacy template',
      details: error.message
    });
  }
});

/**
 * POST /api/privacy-settings/import
 * Import privacy configuration from JSON
 */
router.post('/import', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const importedSettings = req.body;

    // Validate imported data structure
    if (!importedSettings.globalPrivacy || !importedSettings.clusters) {
      return res.status(400).json({
        error: 'Invalid import format. Missing required fields.'
      });
    }

    // Sanitize and apply imported settings
    const settingsData = {
      user_id: userId,
      global_privacy: Math.max(0, Math.min(100, importedSettings.globalPrivacy)),
      selected_audience_id: importedSettings.selectedAudienceId || 'social',
      clusters: importedSettings.clusters || [],
      audience_specific_settings: importedSettings.audienceSpecificSettings || {},
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('privacy_settings')
      .upsert(settingsData, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) throw error;

    // Log import for audit trail
    await supabase.from('privacy_audit_log').insert({
      user_id: userId,
      action: 'import_settings',
      changed_at: new Date().toISOString(),
      metadata: { imported_from: 'json_file' }
    });

    res.json({
      success: true,
      settings: data,
      message: 'Privacy settings imported successfully'
    });
  } catch (error) {
    console.error('Error importing privacy settings:', error);
    res.status(500).json({
      error: 'Failed to import privacy settings',
      details: error.message
    });
  }
});

/**
 * GET /api/privacy-settings/export
 * Export complete privacy configuration as JSON
 */
router.get('/export', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all privacy-related data
    const [settingsResult, templatesResult] = await Promise.all([
      supabase.from('privacy_settings').select('*').eq('user_id', userId).single(),
      supabase.from('privacy_templates').select('*').eq('user_id', userId)
    ]);

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      userId: userId,
      settings: settingsResult.data || {},
      customTemplates: templatesResult.data || [],
      metadata: {
        platform: 'Twin AI Learn',
        dataType: 'privacy-configuration'
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="privacy-settings-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting privacy settings:', error);
    res.status(500).json({
      error: 'Failed to export privacy settings',
      details: error.message
    });
  }
});

/**
 * GET /api/privacy-settings/audit-log
 * Get privacy settings change history
 */
router.get('/audit-log', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const { data: logs, error } = await supabase
      .from('privacy_audit_log')
      .select('*')
      .eq('user_id', userId)
      .order('changed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json(logs || []);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({
      error: 'Failed to fetch audit log',
      details: error.message
    });
  }
});

/**
 * POST /api/privacy-settings/reset
 * Reset privacy settings to defaults
 */
router.post('/reset', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const defaultSettings = {
      user_id: userId,
      global_privacy: 50,
      selected_audience_id: 'social',
      selected_template_id: null,
      clusters: [],
      audience_specific_settings: {},
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('privacy_settings')
      .upsert(defaultSettings, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) throw error;

    // Log reset action
    await supabase.from('privacy_audit_log').insert({
      user_id: userId,
      action: 'reset_to_defaults',
      changed_at: new Date().toISOString()
    });

    res.json({
      success: true,
      settings: data,
      message: 'Privacy settings reset to defaults'
    });
  } catch (error) {
    console.error('Error resetting privacy settings:', error);
    res.status(500).json({
      error: 'Failed to reset privacy settings',
      details: error.message
    });
  }
});

export default router;
