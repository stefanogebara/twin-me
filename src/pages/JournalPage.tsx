import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
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
import { Brain as BrainIcon } from 'lucide-react';

// Mood config with emoji and color
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
  const { user } = useAuth();
  const { isDemoMode } = useDemo();

  // State
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [insights, setInsights] = useState<JournalInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Composer state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [energyLevel, setEnergyLevel] = useState<number>(3);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Design system colors (theme-aware via CSS vars)
  const textPrimary = 'var(--foreground)';
  const textSecondary = 'var(--text-secondary)';
  const borderColor = 'var(--glass-surface-border)';
  const inputBg = 'var(--glass-surface-bg-subtle)';

  // Load data
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

  // Reset composer
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

  // Save entry
  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      if (isDemoMode) {
        // In demo mode, add locally
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

  // Delete entry
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

  // Analyze entry
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

  // Edit entry
  const handleEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setTitle(entry.title || '');
    setContent(entry.content.replace(/''/g, "'"));
    setMood(entry.mood);
    setEnergyLevel(entry.energy_level || 3);
    setTags(entry.tags || []);
    setShowComposer(true);
  };

  // Add tag
  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags(prev => [...prev, t]);
      setTagInput('');
    }
  };

  // Format date
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
    <PageLayout title="Soul Journal" subtitle="Discover yourself through your own words">
      <div className="space-y-8">

        {/* AI Insight Card */}
        {insights && insights.analyzedEntries > 0 && (
          <GlassPanel className="relative overflow-hidden p-8">
            <div className="flex items-start gap-5">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--glass-surface-bg)' }}>
                <BrainIcon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="heading-serif text-sm font-medium mb-2">
                  Your Journal Patterns
                </h3>
                {insights.recentSummaries.length > 0 && (
                  <p className="body-text mb-3" style={{ color: textSecondary }}>
                    {insights.recentSummaries[0]}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {insights.topThemes.slice(0, 4).map(t => (
                    <span
                      key={t.theme}
                      className="px-2.5 py-1 rounded-full text-xs"
                      style={{
                        background: 'var(--glass-surface-bg-subtle)',
                        color: textSecondary,
                        border: `1px solid ${borderColor}`
                      }}
                    >
                      {t.theme}
                    </span>
                  ))}
                  {insights.avgEnergy !== null && (
                    <span
                      className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1"
                      style={{
                        background: 'var(--glass-surface-bg-subtle)',
                        color: textSecondary,
                        border: `1px solid ${borderColor}`
                      }}
                    >
                      <Zap className="w-3 h-3" /> Avg energy: {insights.avgEnergy}/5
                    </span>
                  )}
                </div>
              </div>
            </div>
          </GlassPanel>
        )}

        {/* New Entry Button */}
        {!showComposer && (
          <motion.button
            onClick={() => setShowComposer(true)}
            className="w-full flex items-center gap-3 p-6 rounded-2xl transition-colors duration-200"
            style={{
              background: 'var(--glass-surface-bg-subtle)',
              border: `1px dashed ${borderColor}`,
              color: textSecondary
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <Plus className="w-5 h-5" />
            <span className="body-text">
              Write about your day...
            </span>
          </motion.button>
        )}

        {/* Composer */}
        <AnimatePresence>
        {showComposer && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
          <GlassPanel>
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="heading-serif text-sm font-medium">
                  {editingId ? 'Edit Entry' : 'New Entry'}
                </h3>
                <button onClick={resetComposer} className="p-1 rounded-lg transition-colors hover:bg-black/5">
                  <X className="w-4 h-4" style={{ color: textSecondary }} />
                </button>
              </div>

              {/* Title */}
              <input
                type="text"
                placeholder="Title (optional)"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-3 rounded-xl text-sm outline-none transition-colors"
                style={{
                  background: inputBg,
                  border: `1px solid ${borderColor}`,
                  color: textPrimary,
                  fontFamily: "'Halant', Georgia, serif"
                }}
              />

              {/* Content */}
              <textarea
                placeholder="How was your day? What's on your mind?"
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={5}
                className="w-full px-3 py-3 rounded-xl text-sm outline-none resize-none transition-colors"
                style={{
                  background: inputBg,
                  border: `1px solid ${borderColor}`,
                  color: textPrimary,
                  fontFamily: "'Geist', 'Inter', system-ui, sans-serif"
                }}
                autoFocus
              />

              {/* Mood Selector */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: textSecondary }}>How are you feeling?</label>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(MOOD_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setMood(mood === key ? null : key)}
                      className="px-3 py-1.5 rounded-full text-xs transition-all"
                      style={{
                        background: mood === key ? `${cfg.color}20` : inputBg,
                        border: `1px solid ${mood === key ? cfg.color : borderColor}`,
                        color: mood === key ? cfg.color : textSecondary
                      }}
                    >
                      {cfg.emoji} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Energy Level */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: textSecondary }}>
                  Energy level: {energyLevel}/5
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => setEnergyLevel(level)}
                      className="w-10 h-10 rounded-xl text-sm font-medium transition-all"
                      style={{
                        background: energyLevel >= level ? 'var(--glass-surface-bg-hover)' : inputBg,
                        border: `1px solid ${energyLevel >= level ? 'var(--glass-surface-border-hover)' : borderColor}`,
                        color: textPrimary
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: textSecondary }}>Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map(t => (
                    <span
                      key={t}
                      className="px-2 py-1 rounded-full text-xs flex items-center gap-1"
                      style={{
                        background: 'var(--glass-surface-bg)',
                        color: textSecondary,
                        border: `1px solid ${borderColor}`
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
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add tag..."
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
                      style={{
                        background: inputBg,
                        border: `1px solid ${borderColor}`,
                        color: textPrimary
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={resetComposer}
                  className="px-4 py-2 rounded-full text-sm transition-colors"
                  style={{ color: textSecondary }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!content.trim() || saving}
                  className="btn-cta-app flex items-center gap-2 transition-all disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {editingId ? 'Update' : 'Save Entry'}
                </button>
              </div>
            </div>
          </GlassPanel>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Entry List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: textSecondary }} />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <motion.div
              className="mx-auto mb-4 opacity-50"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.5, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            >
              <BrainIcon className="w-12 h-12" style={{ color: 'var(--text-muted)' }} />
            </motion.div>
            <motion.h3
              className="heading-serif text-lg mb-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
            >
              Nothing written yet
            </motion.h3>
            <motion.p
              className="text-sm mb-8"
              style={{ color: textSecondary }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              What's on your mind? Even a few lines help me understand how you actually see the world.
            </motion.p>

            {/* Suggested writing prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg mx-auto">
              {[
                { prompt: 'How are you feeling right now?', mood: 'reflective' },
                { prompt: "What's on your mind today?", mood: null },
                { prompt: 'Describe your ideal day', mood: 'happy' },
                { prompt: 'What are you grateful for?', mood: 'grateful' },
              ].map(({ prompt, mood: suggestedMood }, i) => (
                <motion.button
                  key={prompt}
                  onClick={() => {
                    setContent(prompt);
                    if (suggestedMood) setMood(suggestedMood);
                    setShowComposer(true);
                  }}
                  className="text-left p-6 rounded-2xl transition-colors duration-200 group"
                  style={{
                    background: 'var(--glass-surface-bg-subtle)',
                    border: `1px dashed ${borderColor}`,
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.3 + i * 0.08, ease: [0.4, 0, 0.2, 1] }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="body-text" style={{ color: textSecondary }}>
                    {prompt}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {entries.map((entry, i) => {
              const isExpanded = expandedEntry === entry.id;
              const analysis = entry.journal_analyses?.[0];
              const moodCfg = entry.mood ? MOOD_CONFIG[entry.mood] : null;

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.06, 0.4), ease: [0.4, 0, 0.2, 1] }}
                >
                <GlassPanel className="cursor-pointer transition-all hover:scale-[1.005]">
                  {/* Entry Header */}
                  <div
                    className="flex items-start gap-3"
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                  >
                    {/* Date Column */}
                    <div className="text-center min-w-[48px]">
                      <div className="text-xs" style={{ color: textSecondary }}>{formatDate(entry.created_at)}</div>
                      {moodCfg && (
                        <div className="text-lg mt-1">{moodCfg.emoji}</div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {entry.title && (
                        <h4 className="heading-serif text-sm font-medium mb-1">
                          {entry.title}
                        </h4>
                      )}
                      <p
                        className={`body-text ${!isExpanded ? 'line-clamp-2' : ''}`}
                        style={{ color: textSecondary }}
                      >
                        {entry.content.replace(/''/g, "'")}
                      </p>

                      {/* Tags */}
                      {entry.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {entry.tags.map(t => (
                            <span
                              key={t}
                              className="px-2 py-0.5 rounded-full text-[10px]"
                              style={{
                                background: 'var(--glass-surface-bg-subtle)',
                                color: textSecondary,
                                border: `1px solid ${borderColor}`
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Expand icon */}
                    <div className="flex items-center gap-1">
                      {entry.is_analyzed && (
                        <Sparkles className="w-3.5 h-3.5" style={{ color: '#9C27B0', opacity: 0.6 }} />
                      )}
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4" style={{ color: textSecondary }} />
                        : <ChevronDown className="w-4 h-4" style={{ color: textSecondary }} />
                      }
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${borderColor}` }}>
                      {/* Entry metadata */}
                      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs" style={{ color: textSecondary }}>
                        <span>{formatFullDate(entry.created_at)}</span>
                        {moodCfg && (
                          <span className="flex items-center gap-1">
                            {moodCfg.emoji} {moodCfg.label}
                          </span>
                        )}
                        {entry.energy_level && (
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" /> Energy: {entry.energy_level}/5
                          </span>
                        )}
                      </div>

                      {/* AI Analysis */}
                      {analysis ? (
                        <div
                          className="rounded-2xl p-6 space-y-3"
                          style={{
                            background: 'rgba(156, 39, 176, 0.04)',
                            border: '1px solid rgba(156, 39, 176, 0.1)'
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <BrainIcon className="w-4 h-4" style={{ color: '#9C27B0' }} />
                            <span className="text-xs font-medium" style={{ color: textPrimary }}>AI Analysis</span>
                          </div>

                          {/* Summary */}
                          <p className="text-sm italic" style={{ color: textSecondary }}>
                            "{analysis.summary}"
                          </p>

                          {/* Emotions */}
                          {analysis.emotions?.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: textPrimary }}>
                                <Heart className="w-3 h-3" /> Emotions detected
                              </div>
                              <div className="flex flex-wrap gap-3">
                                {analysis.emotions.map((em, i) => (
                                  <div key={i} className="flex items-center gap-1.5">
                                    <span className="text-xs" style={{ color: textSecondary }}>{em.emotion}</span>
                                    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-surface-bg)' }}>
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

                          {/* Personality Signals */}
                          {analysis.personality_signals?.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: textPrimary }}>
                                <TrendingUp className="w-3 h-3" /> Personality signals
                              </div>
                              <div className="space-y-1">
                                {analysis.personality_signals.map((sig, i) => (
                                  <div key={i} className="text-xs" style={{ color: textSecondary }}>
                                    <span className="font-medium" style={{ color: textPrimary }}>
                                      {sig.direction === 'high' ? '\u2191' : '\u2193'} {sig.trait}
                                    </span>
                                    {' \u2014 '}
                                    {sig.evidence}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Self-perception */}
                          {analysis.self_perception?.how_they_see_themselves && (
                            <div>
                              <div className="text-xs font-medium mb-1 flex items-center gap-1" style={{ color: textPrimary }}>
                                <Sparkles className="w-3 h-3" /> Self-perception
                              </div>
                              <p className="text-xs" style={{ color: textSecondary }}>
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

                          {/* Themes */}
                          {analysis.themes?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {analysis.themes.map((t, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded-full text-[10px]"
                                  style={{
                                    background: 'var(--glass-surface-bg-subtle)',
                                    color: textSecondary,
                                    border: `1px solid ${borderColor}`
                                  }}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Analyze button */
                        !isDemoMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAnalyze(entry.id); }}
                            disabled={analyzingId === entry.id}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-40"
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
                      <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${borderColor}` }}>
                        {!isDemoMode && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEdit(entry); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-black/5"
                              style={{ color: textSecondary }}
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-red-500/10"
                              style={{ color: '#F44336' }}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </GlassPanel>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default JournalPage;
