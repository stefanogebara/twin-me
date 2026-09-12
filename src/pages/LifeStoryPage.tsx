import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, PageHead, Section, List, Row } from '@/components/register';

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

interface SessionState {
  sessionId: string;
  chapterId: string;
  status: 'active' | 'completed' | 'abandoned';
  transcript: { role: 'assistant' | 'user'; content: string }[];
  questionIndex: number;
}

/**
 * A turn does an LLM call before responding. The browser default gives up
 * well before a cold-cache turn finishes, which surfaced as a false
 * "something went wrong" on work that had actually succeeded.
 */
const TURN_TIMEOUT_MS = 120000;

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

  /**
   * Rebuild the conversation from the server's transcript after a lost turn
   * response. Returns true when the turn had in fact landed, so the caller
   * can skip the error path entirely.
   */
  const resyncSession = async (id: string): Promise<boolean> => {
    try {
      const res = await authFetch(`/life-story/session/${id}`);
      if (!res.ok) return false;
      const { data } = (await res.json()) as { data: SessionState };
      if (!data?.transcript?.length) return false;

      // The server transcript is authoritative — adopt it wholesale rather
      // than trying to reconcile against optimistic local state.
      setMessages(data.transcript.map(m => ({ role: m.role, content: m.content })));

      if (data.status === 'completed') {
        setChapterDone(true);
        loadStatus();
      }
      trackEvent('life_story_turn_recovered', {
        chapter_id: data.chapterId,
        entries: data.transcript.length,
      });
      return true;
    } catch {
      return false;
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
      // A turn runs an LLM call before replying, which on a cold cache can
      // outlast the browser's default fetch timeout. Give it explicit room —
      // bailing early made the UI claim failure for work that had succeeded.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
      let res: Response;
      try {
        res = await authFetch('/life-story/session/turn', {
          method: 'POST',
          body: JSON.stringify({ sessionId, answer }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
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
      // The turn persists the answer and the reply BEFORE responding, so a
      // failure here usually means the response was lost in transit, not that
      // the work failed. Ask the server what is actually true instead of
      // guessing — claiming "something went wrong" for a turn that landed is
      // what made the user retype an answer that was already saved.
      const recovered = await resyncSession(sessionId);
      if (recovered) return;

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'That did not send. Your progress is saved — try again in a moment.' },
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
      <div className="flex flex-col h-[calc(100dvh-9rem)] lg:h-dvh mx-auto w-full" style={{ maxWidth: 'calc(var(--rg-col) + 2 * var(--rg-gutter))', padding: '0 var(--rg-gutter)' }}>
        {/* Header: back, the chapter as a section heading, one grey line. */}
        <div className="flex items-start gap-3" style={{ paddingTop: 32, paddingBottom: 16, borderBottom: '1px solid var(--rg-ink)' }}>
          <button type="button" className="rg-iconbtn" onClick={pauseSession} aria-label="Back to chapters" style={{ marginTop: 6 }}>
            <ArrowLeft aria-hidden="true" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="rg-sechead-title">{activeChapter.title}</h1>
            <p className="rg-sechead-line">
              {chapterDone
                ? 'Chapter complete'
                : `About ${activeChapter.estimatedMinutes} minutes. Pause any time: your progress is saved.`}
            </p>
          </div>
        </div>

        {/* Messages: the twin speaks in ink on the page; your answers sit on the field. */}
        <div className="flex-1 overflow-y-auto py-6 space-y-5">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[85%] whitespace-pre-wrap"
                style={{
                  color: 'var(--rg-ink)',
                  fontSize: 'var(--rg-text)',
                  lineHeight: '21px',
                  ...(msg.role === 'user'
                    ? { background: 'var(--rg-field)', borderRadius: 'var(--rg-radius)', padding: '10px 14px' }
                    : { padding: '0' }),
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start" aria-label="Your twin is writing">
              <div className="flex gap-1.5 py-2">
                {[0, 1, 2].map(d => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: 'var(--rg-quiet)', animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input / completion */}
        <div style={{ paddingBottom: 24 }}>
          {chapterDone ? (
            <button type="button" className="n-btn n-btn--primary" onClick={pauseSession}>
              Back to chapters
            </button>
          ) : (
            <div className="n-prompt" style={{ alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer"
                aria-label="Your answer"
                disabled={sending}
                rows={1}
                className="flex-1 bg-transparent resize-none placeholder:text-[var(--rg-ink-3)]"
                style={{
                  color: 'var(--rg-ink)',
                  fontFamily: 'var(--rg-sans)',
                  fontSize: 'var(--rg-text)',
                  lineHeight: 'var(--rg-line)',
                  letterSpacing: 'var(--rg-track)',
                  minHeight: '32px',
                  maxHeight: '120px',
                  padding: '6px 0',
                  overflowY: 'auto',
                  outline: 'none',
                  border: 0,
                }}
              />
              <button
                type="button"
                onClick={sendAnswer}
                disabled={!input.trim() || sending}
                aria-label="Send answer"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Chapter list
  // ------------------------------------------------------------------
  const completedCount = chapters.filter(c => c.completed).length;
  const allDone = chapters.length > 0 && completedCount === chapters.length;

  return (
    <Page>
      {/* "Complete, revisit any time" used to sit on all eight cards; the page
          says it once and each row carries a check. */}
      <PageHead
        title="Your story"
        line={allDone
          ? 'All eight conversations are done. Open any of them to revisit it.'
          : `Eight short conversations, a few minutes each.${completedCount > 0 ? ` ${completedCount} of ${chapters.length} done.` : ''}`}
      />

      {statusLoading ? (
        <div aria-busy="true" className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'var(--rg-ink-3)' }} />
      ) : statusError ? (
        <p style={{ margin: 0, color: 'var(--rg-ink-2)' }}>
          Could not load your chapters.{' '}
          <button type="button" onClick={loadStatus} style={textLink}>Try again</button>
        </p>
      ) : (
        <Section>
          <List label="Chapters">
            {chapters.map(chapter => {
              const isSuggested = chapter.id === suggestedNext;
              return (
                <Row
                  key={chapter.id}
                  title={chapter.title}
                  line={chapter.intro}
                  // Starting is one request at a time (was the card's disabled state).
                  onClick={() => { if (!sending) startChapter(chapter); }}
                  action={chapter.completed ? (
                    <Check className="rg-chevron" aria-label="Done" />
                  ) : (
                    <span style={{ color: isSuggested ? 'var(--rg-ink)' : 'var(--rg-ink-3)', fontWeight: isSuggested ? 500 : 350, whiteSpace: 'nowrap' }}>
                      {isSuggested ? `Start here, ${chapter.estimatedMinutes} min` : `${chapter.estimatedMinutes} min`}
                    </span>
                  )}
                />
              );
            })}
          </List>
        </Section>
      )}

      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 32 }}>
        <button type="button" className="n-btn n-btn--ghost" onClick={() => navigate(-1)}>
          Back
        </button>
        {completedCount > 0 && (
          <button type="button" className="n-btn n-btn--ghost" onClick={() => navigate('/fidelity')}>
            Check how well your twin knows you
          </button>
        )}
      </div>
    </Page>
  );
}

/** An inline text action: ink, underlined, no box. */
const textLink: React.CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  font: 'inherit',
  color: 'var(--rg-ink)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
};
