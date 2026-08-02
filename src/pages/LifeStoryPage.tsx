import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/**
 * Story Chapters — the chaptered life-story interview (/story).
 * Plan: .claude/plans/2026-08-01-twin-interview/README.md (Phase 2).
 *
 * Grid of 8 short chapters (3-5 min each) -> chat session per chapter.
 * Sessions are server-persisted and resumable; pausing is always safe.
 */

interface ChapterInfo {
  id: string;
  title: string;
  intro: string;
  estimatedMinutes: number;
  questionCount: number;
  completed: boolean;
}

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

type View = 'grid' | 'session';

export default function LifeStoryPage() {
  useDocumentTitle('Your Story');
  const navigate = useNavigate();
  const { trackEvent } = useAnalytics();

  const [view, setView] = useState<View>('grid');
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [suggestedNext, setSuggestedNext] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);

  const [activeChapter, setActiveChapter] = useState<ChapterInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chapterDone, setChapterDone] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startedAtRef = useRef<number>(0);

  const loadStatus = useCallback(async () => {
    try {
      setStatusError(false);
      const res = await authFetch('/life-story/status');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const { data } = await res.json();
      setChapters(data.chapters || []);
      setSuggestedNext(data.suggestedNext || null);
    } catch {
      setStatusError(true);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chapterDone]);

  const startChapter = async (chapter: ChapterInfo) => {
    setSending(true);
    try {
      const res = await authFetch('/life-story/session/start', {
        method: 'POST',
        body: JSON.stringify({ chapterId: chapter.id }),
      });
      if (!res.ok) throw new Error(`start ${res.status}`);
      const { data } = await res.json();

      setActiveChapter(chapter);
      setSessionId(data.sessionId);
      setMessages([{ role: 'assistant', content: data.utterance }]);
      setChapterDone(false);
      setView('session');
      startedAtRef.current = Date.now();
      trackEvent('life_story_chapter_started', {
        chapter_id: chapter.id,
        resumed: data.resumed,
      });
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      setStatusError(true);
    } finally {
      setSending(false);
    }
  };

  const sendAnswer = async () => {
    const answer = input.trim();
    if (!answer || sending || !sessionId || !activeChapter) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { role: 'user', content: answer }]);
    setSending(true);

    try {
      const res = await authFetch('/life-story/session/turn', {
        method: 'POST',
        body: JSON.stringify({ sessionId, answer }),
      });
      if (!res.ok) throw new Error(`turn ${res.status}`);
      const { data } = await res.json();

      trackEvent('life_story_turn_answered', {
        chapter_id: activeChapter.id,
        kind: data.kind,
      });
      if (data.kind === 'followup') {
        trackEvent('life_story_followup_shown', { chapter_id: activeChapter.id });
      }

      if (data.kind === 'chapter_done') {
        if (data.utterance) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.utterance }]);
        }
        setChapterDone(true);
        trackEvent('life_story_chapter_completed', {
          chapter_id: activeChapter.id,
          turns: messages.length + 1,
          duration_seconds: Math.round((Date.now() - startedAtRef.current) / 1000),
        });
        loadStatus();
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.utterance }]);
      }
    } catch {
      // Surface the failure inline and restore the answer so nothing is lost.
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong sending that. Your progress is saved — try again in a moment.' },
      ]);
      setInput(answer);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const pauseSession = () => {
    if (activeChapter && !chapterDone) {
      trackEvent('life_story_chapter_paused', {
        chapter_id: activeChapter.id,
        answers_given: messages.filter(m => m.role === 'user').length,
        duration_seconds: Math.round((Date.now() - startedAtRef.current) / 1000),
      });
    }
    setView('grid');
    setActiveChapter(null);
    setSessionId(null);
    setMessages([]);
    setChapterDone(false);
    loadStatus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAnswer();
    }
  };

  // ------------------------------------------------------------------
  // Session view
  // ------------------------------------------------------------------
  if (view === 'session' && activeChapter) {
    return (
      <div className="flex flex-col h-[calc(100dvh-9rem)] lg:h-dvh max-w-3xl mx-auto px-6">
        {/* Header */}
        <div className="flex items-center gap-3 pt-8 pb-4">
          <button
            onClick={pauseSession}
            aria-label="Back to chapters"
            className="flex items-center justify-center transition-opacity hover:opacity-70"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '100px',
              color: 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '22px',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'var(--foreground)',
              }}
            >
              {activeChapter.title}
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {chapterDone
                ? 'Chapter complete'
                : `About ${activeChapter.estimatedMinutes} minutes — pause any time, your progress is saved`}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[85%] px-4 py-3 text-[15px] leading-relaxed"
                style={
                  msg.role === 'user'
                    ? {
                        background: 'var(--surface-solid)',
                        border: '1px solid var(--glass-surface-border)',
                        borderRadius: '16px 16px 4px 16px',
                        color: 'var(--foreground)',
                        fontFamily: 'Inter, sans-serif',
                      }
                    : {
                        background: 'var(--glass-surface-bg)',
                        backdropFilter: 'blur(42px)',
                        WebkitBackdropFilter: 'blur(42px)',
                        border: '1px solid var(--glass-surface-border)',
                        borderRadius: '16px 16px 16px 4px',
                        color: 'var(--text-narrative)',
                        fontFamily: 'Inter, sans-serif',
                      }
                }
              >
                {msg.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div
                className="px-4 py-3"
                style={{
                  background: 'var(--glass-surface-bg)',
                  border: '1px solid var(--glass-surface-border)',
                  borderRadius: '16px 16px 16px 4px',
                }}
              >
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(d => (
                    <span
                      key={d}
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: 'var(--text-muted)', animationDelay: `${d * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input / completion */}
        <div className="pb-6">
          {chapterDone ? (
            <button
              onClick={pauseSession}
              className="w-full py-3.5 rounded-[12px] text-sm font-medium transition-all hover:brightness-105"
              style={{
                background: 'var(--claura-bone)',
                color: 'var(--claura-bone-ink)',
                fontFamily: "'Inter', sans-serif",
                border: 'none',
                cursor: 'pointer',
                minHeight: '48px',
              }}
            >
              Back to chapters
            </button>
          ) : (
            <div
              className="flex items-end gap-3 rounded-[20px] px-5 py-4"
              style={{
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid var(--glass-surface-border)',
                boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 var(--border-glass)',
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer..."
                disabled={sending}
                rows={1}
                className="flex-1 bg-transparent resize-none"
                style={{
                  color: 'var(--foreground)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '15px',
                  minHeight: '24px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  outline: 'none',
                }}
              />
              <button
                onClick={sendAnswer}
                disabled={!input.trim() || sending}
                aria-label="Send answer"
                className="flex-shrink-0 flex items-center justify-center transition-all duration-200"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '100px',
                  backgroundColor: input.trim() ? '#F5F5F4' : 'transparent',
                  color: input.trim() ? '#0C0C0C' : 'var(--text-muted)',
                  cursor: input.trim() && !sending ? 'pointer' : 'default',
                  opacity: input.trim() ? 1 : 0.3,
                  border: 'none',
                }}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Chapter grid
  // ------------------------------------------------------------------
  const completedCount = chapters.filter(c => c.completed).length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1
        className="mb-2"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: '28px',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: 'var(--foreground)',
        }}
      >
        Your Story
      </h1>
      <p className="text-sm mb-10" style={{ color: 'var(--text-secondary)' }}>
        Eight short conversations, a few minutes each. The more of your story your twin has heard,
        the more it actually knows you.
        {completedCount > 0 && ` ${completedCount} of ${chapters.length} complete.`}
      </p>

      {statusLoading ? (
        <div className="flex items-center justify-center h-40">
          <div
            className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"
            style={{ color: 'var(--text-muted)' }}
          />
        </div>
      ) : statusError ? (
        <div
          className="rounded-[16px] px-5 py-4 text-sm"
          style={{
            background: 'var(--glass-surface-bg)',
            border: '1px solid var(--glass-surface-border)',
            color: 'var(--text-secondary)',
          }}
        >
          Could not load your chapters.{' '}
          <button
            onClick={loadStatus}
            className="underline transition-opacity hover:opacity-70"
            style={{ color: 'var(--foreground)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {chapters.map(chapter => {
            const isSuggested = chapter.id === suggestedNext;
            return (
              <button
                key={chapter.id}
                onClick={() => startChapter(chapter)}
                disabled={sending}
                className="text-left rounded-[16px] px-5 py-4 transition-all hover:brightness-110"
                style={{
                  background: 'var(--glass-surface-bg)',
                  backdropFilter: 'blur(42px)',
                  WebkitBackdropFilter: 'blur(42px)',
                  border: isSuggested
                    ? '1px solid var(--ring)'
                    : '1px solid var(--glass-surface-border)',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span
                    style={{
                      fontFamily: "'Instrument Serif', Georgia, serif",
                      fontSize: '18px',
                      letterSpacing: '-0.02em',
                      color: 'var(--foreground)',
                    }}
                  >
                    {chapter.title}
                  </span>
                  {chapter.completed && (
                    <span
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '100px',
                        background: 'var(--accent-vibrant-glow)',
                        color: 'var(--accent-vibrant)',
                      }}
                    >
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <p className="text-[13px] leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>
                  {chapter.intro}
                </p>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {chapter.completed
                    ? 'Complete — revisit any time'
                    : isSuggested
                      ? `Start here — about ${chapter.estimatedMinutes} min`
                      : `About ${chapter.estimatedMinutes} min`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-10 flex items-center gap-6">
        <button
          onClick={() => navigate(-1)}
          className="py-2.5 text-[13px] transition-opacity hover:opacity-70"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: "'Inter', sans-serif",
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
        {completedCount > 0 && (
          <button
            onClick={() => navigate('/fidelity')}
            className="py-2.5 text-[13px] underline transition-opacity hover:opacity-70"
            style={{
              color: 'var(--text-secondary)',
              fontFamily: "'Inter', sans-serif",
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Check how well your twin knows you now
          </button>
        )}
      </div>
    </div>
  );
}
