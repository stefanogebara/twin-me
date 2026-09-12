import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import { List, Row, Empty } from '@/components/register';


const getAuthHeaders = () => {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const UserRulesSettings: React.FC = () => {
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

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleAdd = async () => {
    if (!newRule.trim()) return;
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
    try {
      const res = await fetch(`${API_URL}/user-rules/${index}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setRules(data.rules);
      } else {
        setError(data.error || 'Failed to delete rule');
      }
    } catch {
      // Mirror the add path — deletion failures must be visible (audit-2026-07-03)
      setError('Failed to delete rule');
    }
  };

  if (loading) {
    return <List label="Rules"><li><Empty>Loading rules</Empty></li></List>;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <List label="Rules" className="rs-compact">
        {rules.length > 0 ? (
          rules.map((rule, i) => (
            <Row
              key={i}
              title={rule}
              action={
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  className="rg-iconbtn"
                  aria-label={`Remove rule: ${rule}`}
                  title="Remove rule"
                >
                  <X aria-hidden="true" />
                </button>
              }
            />
          ))
        ) : (
          <li><Empty>No rules yet. Add one here, or tell your twin in chat.</Empty></li>
        )}
      </List>

      {/* Add new rule */}
      <div className="rs-inline">
        <input
          type="text"
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="For example, I'm vegan"
          disabled={rules.length >= maxRules}
          aria-label="New rule for your twin"
          className="n-input"
          maxLength={120}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newRule.trim() || rules.length >= maxRules}
          className="n-btn n-btn--ghost"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add
        </button>
      </div>

      {error && <p className="rs-bad" role="alert" style={{ margin: 0 }}>{error}</p>}

      <p className="rs-quiet">{rules.length} of {maxRules} rules</p>
    </div>
  );
};

export default UserRulesSettings;
