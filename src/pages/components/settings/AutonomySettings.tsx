import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Zap, Brain, Heart, Music } from 'lucide-react';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import { List, Row, Empty } from '@/components/register';


const getAuthHeaders = () => {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Autonomy levels, 0-4. The register shows them as one select per skill: the
// old five-dot track with 9px tracked caps under it (OBS, SUG...) failed AA.
const AUTONOMY_LEVELS = [
  { label: 'Observe' },
  { label: 'Suggest' },
  { label: 'Draft' },
  { label: 'Act, then tell me' },
  { label: 'Act on its own' },
] as const;

// Category icons: the icon square names the category, so no label is needed.
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  daily_rituals: <Zap />,
  self_discovery: <Brain />,
  social_intelligence: <Heart />,
  content_curation: <Music />,
};

interface SkillSetting {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: string;
  default_autonomy_level: number;
  effective_autonomy_level: number;
  user_enabled: boolean;
  has_override: boolean;
  autonomy_label: string;
  required_platforms?: string[];
}

const AutonomySettings: React.FC = () => {
  const [skills, setSkills] = useState<SkillSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/autonomy/settings`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setSkills(data.settings || []);
      }
    } catch {
      // Silent fail — section just shows empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleLevelChange = async (skillId: string, level: number) => {
    setUpdating(skillId);

    // Optimistic update
    setSkills(prev =>
      prev.map(s =>
        s.id === skillId
          ? { ...s, effective_autonomy_level: level, has_override: true, autonomy_label: AUTONOMY_LEVELS[level].label }
          : s
      )
    );

    try {
      const res = await fetch(`${API_URL}/autonomy/settings/${skillId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ autonomyLevel: level }),
      });
      // audit-2026-06-10: a 4xx/5xx previously left the optimistic slider/badge
      // permanently wrong — only thrown network errors reverted. Revert on any
      // non-OK response too.
      if (!res.ok) fetchSettings();
    } catch {
      // Revert on failure
      fetchSettings();
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return <List label="Skills"><li><Empty>Loading skills</Empty></li></List>;
  }

  if (skills.length === 0) {
    return (
      <List label="Skills">
        <li><Empty>Skills unlock once your twin has a few days of your data.</Empty></li>
      </List>
    );
  }

  // Grouped by category, as before: the rows keep their category's order.
  const byCategory = skills.reduce<Record<string, SkillSetting[]>>((acc, skill) => {
    const cat = skill.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  return (
    <List label="Skills" className="pb-stack">
      {Object.entries(byCategory).flatMap(([category, categorySkills]) =>
        categorySkills.map((skill) => {
          const level = skill.effective_autonomy_level;
          const name = skill.display_name || skill.name;
          return (
            <Row
              key={skill.id}
              icon={CATEGORY_ICONS[category] || <Bot />}
              title={name}
              line={skill.description}
              action={
                <select
                  className="rs-select"
                  value={level}
                  disabled={updating === skill.id}
                  onChange={(e) => handleLevelChange(skill.id, Number(e.target.value))}
                  aria-label={`How much ${name} may do`}
                >
                  {AUTONOMY_LEVELS.map((lvl, i) => (
                    <option key={i} value={i}>{lvl.label}</option>
                  ))}
                </select>
              }
            />
          );
        })
      )}
    </List>
  );
};

export default AutonomySettings;
