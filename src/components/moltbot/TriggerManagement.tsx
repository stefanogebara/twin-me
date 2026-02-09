/**
 * TriggerManagement Component
 *
 * Interface for managing proactive triggers in the Moltbot system.
 * Users can view, create, edit, enable/disable, and delete triggers
 * that automate responses to behavioral patterns.
 */

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Edit2,
  Power,
  Clock,
  AlertCircle,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  Settings,
  Copy,
  Download
} from 'lucide-react';

interface TriggerCondition {
  type: 'time' | 'metric' | 'pattern' | 'event';
  operator?: string;
  value?: any;
  platform?: string;
  field?: string;
  check?: string;
}

interface TriggerAction {
  type: 'log_event' | 'update_pattern' | 'update_trait' | 'notify' | 'suggest';
  category?: string;
  message?: string;
  trait?: string;
  direction?: string;
  weight?: number;
}

interface Trigger {
  id: string;
  name: string;
  description?: string;
  conditions: TriggerCondition[];
  actions: TriggerAction[];
  enabled: boolean;
  cooldown_minutes: number;
  priority: number;
  last_triggered?: string;
  fire_count?: number;
  created_at: string;
}

interface TriggerTemplate {
  id: string;
  name: string;
  description: string;
  conditions: TriggerCondition[];
  actions: TriggerAction[];
  research_basis?: string;
}

interface TriggerManagementProps {
  userId?: string;
  onTriggerFire?: (triggerId: string) => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const CONDITION_TYPE_LABELS: Record<string, string> = {
  time: 'Time-based',
  metric: 'Metric threshold',
  pattern: 'Pattern match',
  event: 'Platform event'
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  log_event: 'Log Event',
  update_pattern: 'Update Pattern',
  update_trait: 'Update Trait',
  notify: 'Send Notification',
  suggest: 'Create Suggestion'
};

export const TriggerManagement: React.FC<TriggerManagementProps> = ({
  userId,
  onTriggerFire
}) => {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [templates, setTemplates] = useState<TriggerTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTrigger, setExpandedTrigger] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const isDemoMode = localStorage.getItem('demo_mode') === 'true';
    if (isDemoMode) {
      // In demo mode, show sample triggers instead of fetching from API
      setTriggers([
        {
          id: 'demo-trigger-1',
          name: 'Morning Energy Check',
          description: 'Check recovery score every morning to suggest optimal daily plan',
          conditions: [{ type: 'time', value: '08:00' }],
          actions: [{ type: 'log_event', category: 'morning_routine' }],
          enabled: true,
          cooldown_minutes: 1440,
          priority: 75,
          created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          fire_count: 7,
          last_triggered: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'demo-trigger-2',
          name: 'Low Recovery Alert',
          description: 'Alert when Whoop recovery drops below 50%',
          conditions: [{ type: 'metric', platform: 'whoop', field: 'recovery', operator: '<', value: 50 }],
          actions: [{ type: 'notify', message: 'Your recovery is low. Consider lighter activities today.' }],
          enabled: true,
          cooldown_minutes: 720,
          priority: 90,
          created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          fire_count: 3,
        }
      ]);
      setTemplates([
        {
          id: 'template-1',
          name: 'Focus Time Music',
          description: 'Suggest ambient music when calendar shows a focus block',
          conditions: [{ type: 'event', platform: 'google_calendar', check: 'focus_block_detected' }],
          actions: [{ type: 'suggest', message: 'Start your ambient playlist for deep work' }],
          research_basis: 'Music context switching improves focus by reducing cognitive load'
        },
        {
          id: 'template-2',
          name: 'High Strain Recovery',
          description: 'Suggest relaxation after high strain days',
          conditions: [{ type: 'metric', platform: 'whoop', field: 'strain', operator: '>', value: 15 }],
          actions: [{ type: 'suggest', message: 'High strain day. Try relaxing music to aid recovery.' }],
          research_basis: 'Downregulation music aids parasympathetic recovery'
        }
      ]);
      setError(null);
      setLoading(false);
      return;
    }
    fetchTriggers();
    fetchTemplates();
  }, [userId]);

  const fetchTriggers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE}/moltbot/triggers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch triggers');

      const data = await response.json();
      setTriggers(data.triggers || []);
      setError(null);
    } catch (err) {
      console.error('[TriggerManagement] Error:', err);
      setError('Failed to load triggers');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/moltbot/triggers/templates`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('[TriggerManagement] Templates error:', err);
    }
  };

  const handleToggle = async (triggerId: string, enabled: boolean) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/moltbot/triggers/${triggerId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled })
      });

      if (response.ok) {
        setTriggers(prev =>
          prev.map(t => t.id === triggerId ? { ...t, enabled } : t)
        );
      }
    } catch (err) {
      console.error('[TriggerManagement] Toggle error:', err);
    }
  };

  const handleDelete = async (triggerId: string) => {
    if (!confirm('Are you sure you want to delete this trigger?')) return;

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/moltbot/triggers/${triggerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setTriggers(prev => prev.filter(t => t.id !== triggerId));
      }
    } catch (err) {
      console.error('[TriggerManagement] Delete error:', err);
    }
  };

  const handleInstallDefaults = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/moltbot/triggers/install-defaults`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        await fetchTriggers();
      }
    } catch (err) {
      console.error('[TriggerManagement] Install defaults error:', err);
    }
  };

  const handleCreateFromTemplate = async (template: TriggerTemplate) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/moltbot/triggers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          conditions: template.conditions,
          actions: template.actions,
          cooldown_minutes: 60,
          priority: 50
        })
      });

      if (response.ok) {
        await fetchTriggers();
        setShowTemplates(false);
      }
    } catch (err) {
      console.error('[TriggerManagement] Create error:', err);
    }
  };

  const formatLastTriggered = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const renderCondition = (condition: TriggerCondition, idx: number) => (
    <div key={idx} className="flex items-center gap-2 text-xs">
      <span className="px-2 py-0.5 bg-gray-700 rounded text-gray-300">
        {CONDITION_TYPE_LABELS[condition.type] || condition.type}
      </span>
      {condition.platform && (
        <span className="text-gray-400">{condition.platform}</span>
      )}
      {condition.field && (
        <span className="text-gray-400">{condition.field}</span>
      )}
      {condition.operator && (
        <span className="text-purple-400">{condition.operator}</span>
      )}
      {condition.value !== undefined && (
        <span className="text-blue-400 font-mono">
          {typeof condition.value === 'object' ? JSON.stringify(condition.value) : String(condition.value)}
        </span>
      )}
    </div>
  );

  const renderAction = (action: TriggerAction, idx: number) => (
    <div key={idx} className="flex items-center gap-2 text-xs">
      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
        {ACTION_TYPE_LABELS[action.type] || action.type}
      </span>
      {action.category && (
        <span className="text-gray-400">category: {action.category}</span>
      )}
      {action.message && (
        <span className="text-gray-400 truncate max-w-32">"{action.message}"</span>
      )}
      {action.trait && (
        <span className="text-green-400">{action.trait} {action.direction}</span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-700 rounded w-1/3" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-800 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Proactive Triggers</h3>
              <p className="text-xs text-gray-500">
                {triggers.length} trigger{triggers.length !== 1 ? 's' : ''} configured
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Templates
            </button>
            <button
              onClick={handleInstallDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white transition-colors"
            >
              <Download className="w-4 h-4" />
              Install Defaults
            </button>
          </div>
        </div>
      </div>

      {/* Templates Panel */}
      {showTemplates && (
        <div className="p-4 bg-gray-800/30 border-b border-gray-800">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Available Templates</h4>
          <div className="grid md:grid-cols-2 gap-3">
            {templates.map(template => (
              <div
                key={template.id}
                className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
                onClick={() => handleCreateFromTemplate(template)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="text-sm font-medium text-white">{template.name}</h5>
                    <p className="text-xs text-gray-400 mt-1">{template.description}</p>
                  </div>
                  <Plus className="w-4 h-4 text-gray-500" />
                </div>
                {template.research_basis && (
                  <p className="text-[10px] text-gray-500 mt-2 italic">
                    Research: {template.research_basis}
                  </p>
                )}
              </div>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-gray-500 col-span-2">No templates available</p>
            )}
          </div>
        </div>
      )}

      {/* Triggers List */}
      <div className="divide-y divide-gray-800">
        {error ? (
          <div className="p-6 text-center text-gray-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
            <p>{error}</p>
            <button onClick={fetchTriggers} className="mt-2 text-blue-400 text-sm hover:underline">
              Retry
            </button>
          </div>
        ) : triggers.length === 0 ? (
          <div className="p-6 text-center">
            <Zap className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No triggers configured</p>
            <p className="text-xs text-gray-500 mt-1">
              Create triggers to automate responses to your behavioral patterns
            </p>
            <button
              onClick={handleInstallDefaults}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white transition-colors"
            >
              Install Default Triggers
            </button>
          </div>
        ) : (
          triggers.map(trigger => {
            const isExpanded = expandedTrigger === trigger.id;

            return (
              <div key={trigger.id} className="p-4">
                {/* Trigger Header */}
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => setExpandedTrigger(isExpanded ? null : trigger.id)}
                  >
                    <button className="text-gray-500">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <div className={`p-1.5 rounded-lg ${trigger.enabled ? 'bg-green-500/10' : 'bg-gray-700'}`}>
                      <Zap className={`w-4 h-4 ${trigger.enabled ? 'text-green-400' : 'text-gray-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-white truncate">{trigger.name}</h4>
                        {trigger.priority > 70 && (
                          <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px]">
                            High Priority
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {trigger.cooldown_minutes}m cooldown
                        </span>
                        <span>
                          Last: {formatLastTriggered(trigger.last_triggered)}
                        </span>
                        {trigger.fire_count !== undefined && (
                          <span>{trigger.fire_count} fires</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(trigger.id, !trigger.enabled)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        trigger.enabled
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                      title={trigger.enabled ? 'Disable' : 'Enable'}
                    >
                      {trigger.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(trigger.id)}
                      className="p-1.5 rounded-lg bg-gray-700 text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="mt-4 ml-10 space-y-4">
                    {trigger.description && (
                      <p className="text-sm text-gray-400">{trigger.description}</p>
                    )}

                    {/* Conditions */}
                    <div>
                      <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                        Conditions (all must be true)
                      </h5>
                      <div className="space-y-2 p-3 bg-gray-800/30 rounded-lg">
                        {trigger.conditions.map((condition, idx) => renderCondition(condition, idx))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div>
                      <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                        Actions
                      </h5>
                      <div className="space-y-2 p-3 bg-gray-800/30 rounded-lg">
                        {trigger.actions.map((action, idx) => renderAction(action, idx))}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Created: {new Date(trigger.created_at).toLocaleDateString()}</span>
                      <span>Priority: {trigger.priority}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer with stats */}
      {triggers.length > 0 && (
        <div className="p-3 border-t border-gray-800 bg-gray-800/20">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {triggers.filter(t => t.enabled).length} active / {triggers.length} total
            </span>
            <span>
              Total fires: {triggers.reduce((sum, t) => sum + (t.fire_count || 0), 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TriggerManagement;
