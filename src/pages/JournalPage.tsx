import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { journalAPI } from '@/services/apiService';
import type { JournalEntry, JournalAnalysis, JournalInsights } from '@/services/apiService';
import { getDemoJournalData } from '@/services/demoDataService';
import {
  Plus,
  Sparkles,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit3,
  Loader2,
  Tag,
  Zap,
  TrendingUp,
  Heart
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const MOOD_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  happy: { emoji: '\u{1F60A}', label: 'Happy', color: '#4CAF50' },
  calm: { emoji: '\u{1F60C}', label: 'Calm', color: '#2196F3' },
  anxious: { emoji: '\u{1F630}', label: 'Anxious', color: '#FF9800' },
  sad: { emoji: '\u{1F614}', label: 'Sad', color: '#9E9E9E' },
  energized: { emoji: '\u{26A1}', label: 'Energized', color: '#FFEB3B' },
  reflective: { emoji: '\u{1F914}', label: 'Reflective', color: '#9C27B0' },
  grateful: { emoji: '\u{1F64F}', label: 'Grateful', color: '#E91E63' },
  frustrated: { emoji: '\u{1F624}', label: 'Frustrated', color: '#F44336' },
};

const JournalPage: React.FC = () => {
  useDocumentTitle('Soul Journal');
  const { user } = useAuth();
  const { isDemoMode } = useDemo();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [insights, setInsights] = useState<JournalInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [energyLevel, setEnergyLevel] = useState<number>(3);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemoMode) {
        const demoData = getDemoJournalData();
        setEntries(demoData.entries as unknown as JournalEntry[]);
        setInsights(demoData.insights as JournalInsights);
      } else {
        const [entriesRes, insightsRes] = await Promise.all([
          journalAPI.getEntries(1, 50),
          journalAPI.getInsights().catch(() => ({ insights: null }))
        ]);
        setEntries(entriesRes.entries);
        setInsights(insightsRes.insights);
      }
    } catch (err) {
      console.error('Failed to load journal data:', err);
    } finally {
      setLoading(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetComposer = () => {
    setTitle('');
    setContent('');
    setMood(null);
    setEnergyLevel(3);
    setTags([]);
    setTagInput('');
    setShowComposer(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      if (isDemoMode) {
        const newEntry: JournalEntry = {
          id: `demo-new-${Date.now()}`,
          user_id: 'demo',
          title: title.trim() || null,
          content: content.trim(),
          mood: mood as JournalEntry['mood'],
          energy_level: energyLevel,
          tags,
          is_analyzed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          journal_analyses: []
        };
        setEntries(prev => [newEntry, ...prev]);
        resetComposer();
        return;
      }

      if (editingId) {
        const result = await journalAPI.updateEntry(editingId, {
          title: title.trim() || undefined,
          content: content.trim(),
          mood: mood || undefined,
          energy_level: energyLevel,
          tags
        });
        setEntries(prev => prev.map(e => e.id === editingId ? { ...e, ...result.entry } : e));
      } else {
        const result = await journalAPI.createEntry({
          title: title.trim() || undefined,
          content: content.trim(),
          mood: mood || undefined,
          energy_level: energyLevel,
          tags
        });
        setEntries(prev => [result.entry, ...prev]);
      }
      resetComposer();
    } catch (err) {
      console.error('Failed to save entry:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (isDemoMode) {
      setEntries(prev => prev.filter(e => e.id !== id));
      return;
    }
    try {
      await journalAPI.deleteEntry(id);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  const handleAnalyze = async (id: string) => {
    if (isDemoMode) return;
    setAnalyzingId(id);
    try {
      const result = await journalAPI.analyzeEntry(id);
      setEntries(prev => prev.map(e =>
        e.id === id
          ? { ...e, is_analyzed: true, journal_analyses: [result.analysis] }
          : e
      ));
    } catch (err) {
      console.error('Failed to analyze entry:', err);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setTitle(entry.title || '');
    setContent(entry.content.replace(/''/g, "'"));
    setMood(entry.mood);
    setEnergyLevel(entry.energy_level || 3);
    setTags(entry.tags || []);
    setShowComposer(true);
  };

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags(prev => [...prev, t]);
      setTagInput('');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      {/* Header */}
      <h1
        className="mb-2"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        Soul Journal
      </h1>
      <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
        Discover yourself through your own words
      </p>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mb-8" />

      {/* AI Insight Card */}
      {insights && insights.analyzedEntries > 0 && (
        <div className="mb-8">
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
          >
            Your Journal Patterns
          </span>
          {insights.recentSummaries.length > 0 && (
            <p className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}>
              {insights.recentSummaries[0]}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {insights.topThemes.slice(0, 4).map(t => (
              <span
                key={t.theme}
                className="px-2.5 py-1 rounded-full text-[11px]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                {t.theme}
              </span>
            ))}
            {insights.avgEnergy !== null && (
              <span
                className="px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <Zap className="w-3 h-3" /> Avg energy: {insights.avgEnergy}/5
              </span>
            )}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mt-6 mb-8" />
        </div>
      )}

      {/* New Entry Button */}
      {!showComposer && (
        <button
          onClick={() => setShowComposer(true)}
          className="w-full flex items-center gap-3 py-4 px-5 rounded-lg transition-opacity hover:opacity-70 mb-8"
          style={{
            border: '1px dashed rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
            Write about your day...
          </span>
        </button>
      )}

      {/* Composer */}
      {showComposer && (
        <div
          className="mb-8 p-5 rounded-lg space-y-5"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}>
              {editingId ? 'Edit Entry' : 'New Entry'}
            </span>
            <button onClick={resetComposer} className="p-1 transition-opacity hover:opacity-60">
              <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            </button>
          </div>

          <input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--foreground)',
              fontFamily: "'Instrument Serif', Georgia, serif"
            }}
          />

          <textarea
            placeholder="How was your day? What's on your mind?"
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={5}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--foreground)',
              fontFamily: "'Inter', sans-serif"
            }}
            autoFocus
          />

          {/* Mood Selector */}
          <div>
            <label className="text-[11px] mb-2 block" style={{ color: 'rgba(255,255,255,0.35)' }}>How are you feeling?</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MOOD_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setMood(mood === key ? null : key)}
                  className="px-3 py-1.5 rounded-full text-xs transition-all"
                  style={{
                    background: mood === key ? `${cfg.color}20` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${mood === key ? cfg.color : 'rgba(255,255,255,0.08)'}`,
                    color: mood === key ? cfg.color : 'rgba(255,255,255,0.4)'
                  }}
                >
                  {cfg.emoji} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Energy Level */}
          <div>
            <label className="text-[11px] mb-2 block" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Energy level: {energyLevel}/5
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(level => (
                <button
                  key={level}
                  onClick={() => setEnergyLevel(level)}
                  className="w-10 h-10 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: energyLevel >= level ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${energyLevel >= level ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                    color: 'var(--foreground)'
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[11px] mb-2 block" style={{ color: 'rgba(255,255,255,0.35)' }}>Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map(t => (
                <span
                  key={t}
                  className="px-2 py-1 rounded-full text-xs flex items-center gap-1"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.4)',
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  <Tag className="w-3 h-3" />
                  {t}
                  <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="ml-0.5 hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            {tags.length < 5 && (
              <input
                type="text"
                placeholder="Add tag..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                className="px-3 py-1.5 rounded-lg text-xs outline-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--foreground)'
                }}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={resetComposer}
              className="px-4 py-2 rounded-lg text-sm transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!content.trim() || saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{
                backgroundColor: '#10b77f',
                color: '#0a0f0a',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {editingId ? 'Update' : 'Save Entry'}
            </button>
          </div>
        </div>
      )}

      {/* Entry List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <p
            className="text-sm mb-2"
            style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
          >
            Nothing written yet
          </p>
          <p
            className="text-xs mb-8"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            What's on your mind? Even a few lines help me understand how you actually see the world.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
            {[
              { prompt: 'How are you feeling right now?', mood: 'reflective' },
              { prompt: "What's on your mind today?", mood: null },
              { prompt: 'Describe your ideal day', mood: 'happy' },
              { prompt: 'What are you grateful for?', mood: 'grateful' },
            ].map(({ prompt, mood: suggestedMood }) => (
              <button
                key={prompt}
                onClick={() => {
                  setContent(prompt);
                  if (suggestedMood) setMood(suggestedMood);
                  setShowComposer(true);
                }}
                className="text-left py-3 px-4 rounded-lg transition-opacity hover:opacity-70"
                style={{
                  border: '1px dashed rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '13px',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-0">
          {entries.map((entry) => {
            const isExpanded = expandedEntry === entry.id;
            const analysis = entry.journal_analyses?.[0];
            const moodCfg = entry.mood ? MOOD_CONFIG[entry.mood] : null;

            return (
              <div
                key={entry.id}
                className="py-5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                {/* Entry Header */}
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                >
                  <div className="text-center min-w-[48px]">
                    <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatDate(entry.created_at)}</div>
                    {moodCfg && <div className="text-lg mt-1">{moodCfg.emoji}</div>}
                  </div>

                  <div className="flex-1 min-w-0">
                    {entry.title && (
                      <h4 className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}>
                        {entry.title}
                      </h4>
                    )}
                    <p
                      className={`text-sm leading-relaxed ${!isExpanded ? 'line-clamp-2' : ''}`}
                      style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
                    >
                      {entry.content.replace(/''/g, "'")}
                    </p>

                    {entry.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {entry.tags.map(t => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full text-[10px]"
                            style={{
                              background: 'rgba(255,255,255,0.04)',
                              color: 'rgba(255,255,255,0.35)',
                              border: '1px solid rgba(255,255,255,0.06)'
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {entry.is_analyzed && (
                      <Sparkles className="w-3.5 h-3.5" style={{ color: '#9C27B0', opacity: 0.6 }} />
                    )}
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                      : <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                    }
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="mt-4 pt-4 ml-[60px]" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      <span>{formatFullDate(entry.created_at)}</span>
                      {moodCfg && <span className="flex items-center gap-1">{moodCfg.emoji} {moodCfg.label}</span>}
                      {entry.energy_level && (
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" /> Energy: {entry.energy_level}/5
                        </span>
                      )}
                    </div>

                    {/* AI Analysis */}
                    {analysis ? (
                      <div
                        className="rounded-lg p-5 space-y-3 mb-4"
                        style={{
                          background: 'rgba(156, 39, 176, 0.04)',
                          border: '1px solid rgba(156, 39, 176, 0.1)'
                        }}
                      >
                        <span className="text-[11px] font-medium tracking-widest uppercase block" style={{ color: '#9C27B0' }}>
                          AI Analysis
                        </span>

                        <p className="text-sm italic leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          "{analysis.summary}"
                        </p>

                        {analysis.emotions?.length > 0 && (
                          <div>
                            <div className="text-[11px] font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--foreground)' }}>
                              <Heart className="w-3 h-3" /> Emotions detected
                            </div>
                            <div className="flex flex-wrap gap-3">
                              {analysis.emotions.map((em, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{em.emotion}</span>
                                  <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${em.intensity * 100}%`, background: '#9C27B0' }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {analysis.personality_signals?.length > 0 && (
                          <div>
                            <div className="text-[11px] font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--foreground)' }}>
                              <TrendingUp className="w-3 h-3" /> Personality signals
                            </div>
                            <div className="space-y-1">
                              {analysis.personality_signals.map((sig, i) => (
                                <div key={i} className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                  <span className="font-medium" style={{ color: 'var(--foreground)' }}>
                                    {sig.direction === 'high' ? '\u2191' : '\u2193'} {sig.trait}
                                  </span>
                                  {' \u2014 '}
                                  {sig.evidence}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {analysis.self_perception?.how_they_see_themselves && (
                          <div>
                            <div className="text-[11px] font-medium mb-1 flex items-center gap-1" style={{ color: 'var(--foreground)' }}>
                              <Sparkles className="w-3 h-3" /> Self-perception
                            </div>
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                              {analysis.self_perception.how_they_see_themselves}
                            </p>
                            {analysis.self_perception.values_expressed?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {analysis.self_perception.values_expressed.map((v, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 rounded-full text-[10px]"
                                    style={{
                                      background: 'rgba(156, 39, 176, 0.08)',
                                      color: '#9C27B0',
                                      border: '1px solid rgba(156, 39, 176, 0.15)'
                                    }}
                                  >
                                    {v}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {analysis.themes?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {analysis.themes.map((t, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full text-[10px]"
                                style={{
                                  background: 'rgba(255,255,255,0.04)',
                                  color: 'rgba(255,255,255,0.35)',
                                  border: '1px solid rgba(255,255,255,0.06)'
                                }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      !isDemoMode && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAnalyze(entry.id); }}
                          disabled={analyzingId === entry.id}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40 mb-4"
                          style={{
                            background: 'rgba(156, 39, 176, 0.06)',
                            color: '#9C27B0',
                            border: '1px solid rgba(156, 39, 176, 0.2)'
                          }}
                        >
                          {analyzingId === entry.id
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                            : <><Sparkles className="w-3.5 h-3.5" /> Analyze with AI</>
                          }
                        </button>
                      )
                    )}

                    {/* Entry actions */}
                    {!isDemoMode && (
                      <div className="flex items-center gap-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(entry); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-70"
                          style={{ color: 'rgba(255,255,255,0.4)' }}
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-70"
                          style={{ color: '#ef4444' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JournalPage;
