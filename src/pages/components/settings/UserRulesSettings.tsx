import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, X, Check } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeaders = () => {
  const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

interface UserRulesSettingsProps {
  isDemoMode: boolean;
}

const UserRulesSettings: React.FC<UserRulesSettingsProps> = ({ isDemoMode }) => {
  const [rules, setRules] = useState<string[]>([]);
  const [maxRules, setMaxRules] = useState(20);
  const [loading, setLoading] = useState(true);
  const [newRule, setNewRule] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/user-rules`, { headers: getAuthHeaders() });
      const data = await res.json();
      setRules(data.rules || []);
      setMaxRules(data.maxRules || 20);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleAdd = async () => {
    if (!newRule.trim() || isDemoMode) return;
    setAdding(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/user-rules`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ rule: newRule.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setRules(data.rules);
        setNewRule('');
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to add rule');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (index: number) => {
    if (isDemoMode) return;
    try {
      const res = await fetch(`${API_URL}/user-rules/${index}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setRules(data.rules);
      }
    } catch {
      // Silent
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <div className="w-4 h-4 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.1)' }} />
        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading rules...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Explainer */}
      <div
        className="flex items-start gap-3 mb-4 p-3 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Shield className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
        <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Rules your twin will <strong style={{ color: 'rgba(255,255,255,0.6)' }}>always</strong> follow.
          Say things like "I'm vegan" or "Never mention my ex". You can also tell your twin in chat.
        </p>
      </div>

      {/* Rules list */}
      {rules.length > 0 ? (
        <div className="flex flex-col gap-1 mb-3">
          {rules.map((rule, i) => (
            <div
              key={i}
              className="flex items-center gap-2 py-2 px-3 rounded-lg group"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <Check className="w-3 h-3 shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
              <span className="text-[13px] flex-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {rule}
              </span>
              {!isDemoMode && (
                <button
                  onClick={() => handleDelete(i)}
                  className="p-1 rounded-md bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove rule"
                >
                  <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-center py-3 mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
          No rules yet. Add one below or tell your twin in chat.
        </p>
      )}

      {/* Add new rule */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. I'm allergic to shellfish"
          disabled={isDemoMode || rules.length >= maxRules}
          className="flex-1 text-[13px] px-3 py-2 rounded-lg border-none outline-none"
          style={{
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--foreground)',
            opacity: isDemoMode ? 0.4 : 1,
          }}
          maxLength={120}
        />
        <button
          onClick={handleAdd}
          disabled={isDemoMode || adding || !newRule.trim() || rules.length >= maxRules}
          className="px-3 py-2 rounded-lg border-none cursor-pointer transition-opacity disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
          style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--foreground)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-[12px]">Add</span>
        </button>
      </div>

      {error && (
        <p className="text-[11px] mt-2" style={{ color: 'rgba(239,68,68,0.7)' }}>{error}</p>
      )}

      <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.15)' }}>
        {rules.length}/{maxRules} rules
      </p>
    </div>
  );
};

export default UserRulesSettings;
