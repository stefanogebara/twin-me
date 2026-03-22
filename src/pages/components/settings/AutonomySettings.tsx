import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Zap, Brain, Heart, Music, AlertTriangle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Autonomy level labels and colors
const AUTONOMY_LEVELS = [
  { label: 'Observe', short: 'OBS', color: 'rgba(255,255,255,0.2)' },
  { label: 'Suggest', short: 'SUG', color: 'rgba(255,255,255,0.15)' },
  { label: 'Draft', short: 'DFT', color: 'rgba(255,255,255,0.25)' },
  { label: 'Act & Notify', short: 'ACT', color: 'rgba(255,255,255,0.35)' },
  { label: 'Autonomous', short: 'AUTO', color: 'rgba(255,255,255,0.55)' },
] as const;

// Category icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  daily_rituals: <Zap className="w-3.5 h-3.5" />,
  self_discovery: <Brain className="w-3.5 h-3.5" />,
  social_intelligence: <Heart className="w-3.5 h-3.5" />,
  content_curation: <Music className="w-3.5 h-3.5" />,
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

interface AutonomySettingsProps {
  isDemoMode: boolean;
}

const AutonomySettings: React.FC<AutonomySettingsProps> = ({ isDemoMode }) => {
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
    if (isDemoMode) return;
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
      await fetch(`${API_URL}/autonomy/settings/${skillId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ autonomyLevel: level }),
      });
    } catch {
      // Revert on failure
      fetchSettings();
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center">
        <div
          className="w-4 h-4 rounded-full animate-pulse"
          style={{ background: 'rgba(255,255,255,0.1)' }}
        />
        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Loading skills...
        </span>
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="py-6 text-center">
        <Bot className="w-5 h-5 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.2)' }} />
        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          No agentic skills available yet
        </span>
      </div>
    );
  }

  // Group by category
  const byCategory = skills.reduce<Record<string, SkillSetting[]>>((acc, skill) => {
    const cat = skill.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    daily_rituals: 'Daily Rituals',
    self_discovery: 'Self Discovery',
    social_intelligence: 'Social Intelligence',
    content_curation: 'Content Curation',
  };

  return (
    <div>
      {/* Explainer */}
      <div
        className="flex items-start gap-3 mb-5 p-3 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent-vibrant, rgba(255,255,255,0.85))' }} />
        <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Control how much your twin can act on its own. <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Observe</strong> means it only watches. <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Autonomous</strong> means it acts without asking.
        </p>
      </div>

      {Object.entries(byCategory).map(([category, categorySkills]) => (
        <div key={category} className="mb-4 last:mb-0">
          {/* Category header */}
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: 'rgba(255,255,255,0.25)' }}>
              {CATEGORY_ICONS[category] || <Bot className="w-3.5 h-3.5" />}
            </span>
            <span
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              {categoryLabels[category] || category}
            </span>
          </div>

          {/* Skills in category */}
          {categorySkills.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              isUpdating={updating === skill.id}
              isDemoMode={isDemoMode}
              onLevelChange={handleLevelChange}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// ── Individual skill row with autonomy slider ───────────────────────────

interface SkillRowProps {
  skill: SkillSetting;
  isUpdating: boolean;
  isDemoMode: boolean;
  onLevelChange: (skillId: string, level: number) => void;
}

const SkillRow: React.FC<SkillRowProps> = ({ skill, isUpdating, isDemoMode, onLevelChange }) => {
  const level = skill.effective_autonomy_level;
  const levelInfo = AUTONOMY_LEVELS[level] || AUTONOMY_LEVELS[1];

  return (
    <div
      className="py-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Skill info row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm block" style={{ color: 'var(--foreground)' }}>
            {skill.display_name || skill.name}
          </span>
          <p
            className="text-[11px] mt-0.5 truncate"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            {skill.description}
          </p>
        </div>

        {/* Current level badge */}
        <span
          className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ml-3 transition-colors"
          style={{
            background: levelInfo.color,
            color: level >= 2 ? '#1b1818' : 'rgba(255,255,255,0.6)',
            opacity: isUpdating ? 0.5 : 1,
          }}
        >
          {levelInfo.label}
        </span>
      </div>

      {/* Slider track */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 relative h-6 flex items-center cursor-pointer"
          style={{ opacity: isDemoMode ? 0.4 : 1 }}
        >
          {/* Track background */}
          <div
            className="absolute inset-x-0 h-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)', top: '50%', transform: 'translateY(-50%)' }}
          />

          {/* Filled track */}
          <div
            className="absolute h-1 rounded-full transition-all duration-200"
            style={{
              background: `linear-gradient(90deg, rgba(255,255,255,0.1), ${levelInfo.color})`,
              width: `${(level / 4) * 100}%`,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />

          {/* Dot stops */}
          {AUTONOMY_LEVELS.map((_, i) => (
            <button
              key={i}
              onClick={() => onLevelChange(skill.id, i)}
              disabled={isDemoMode || isUpdating}
              className="absolute w-3 h-3 rounded-full transition-all duration-200 hover:scale-125 disabled:cursor-not-allowed"
              style={{
                left: `calc(${(i / 4) * 100}% - 6px)`,
                background: i <= level
                  ? AUTONOMY_LEVELS[i].color
                  : 'rgba(255,255,255,0.12)',
                border: i === level
                  ? '2px solid var(--accent-vibrant, rgba(255,255,255,0.85))'
                  : '1px solid rgba(255,255,255,0.1)',
                boxShadow: i === level ? '0 0 6px rgba(255,255,255,0.15)' : 'none',
              }}
              title={AUTONOMY_LEVELS[i].label}
            />
          ))}
        </div>
      </div>

      {/* Level labels below track */}
      <div className="flex justify-between mt-1 px-0.5">
        {AUTONOMY_LEVELS.map((lvl, i) => (
          <span
            key={i}
            className="text-[9px] cursor-pointer transition-colors"
            style={{
              color: i === level ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
              width: i === 0 ? 'auto' : i === 4 ? 'auto' : '20%',
              textAlign: i === 0 ? 'left' : i === 4 ? 'right' : 'center',
            }}
            onClick={() => !isDemoMode && !isUpdating && onLevelChange(skill.id, i)}
          >
            {lvl.short}
          </span>
        ))}
      </div>
    </div>
  );
};

export default AutonomySettings;
