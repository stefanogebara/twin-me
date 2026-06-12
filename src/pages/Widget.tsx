import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Send, Loader2, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { MessageList } from '@/components/chat/MessageList';
import {
  HUMMINGBIRD_CONTEXT_KEY,
  parseHummingbirdContext,
  summarizeActionStart,
  summarizeActionResult,
  summarizeActionFailure,
} from '@/lib/hummingbirdWidget';

/**
 * Widget — compact, chrome-less twin chat surface.
 * ================================================
 * Designed to live inside a 460x600 desktop "Hummingbird" panel (a Tauri
 * webview pointed at https://twinme.me/widget). No app sidebar, no
 * conversation list, no context/sources panel — just a slim brand bar, a
 * scrollable message list, and a bottom-pinned composer.
 *
 * Reuses MessageList (markdown rendering, retry, copy, error/thinking states)
 * and the SAME streaming endpoint as TalkToTwin:
 *   POST /api/chat/message?stream=1
 * parsing chunk / done / error SSE events, plus a text-only rendering of
 * action_start / action_result ("Checking Gmail..." -> "Found 3 emails.").
 * The full interactive pill + confirmation machinery from TalkToTwin is
 * intentionally NOT here — write tools (action_pending_confirmation) have no
 * approval surface in the widget, so those events are still dropped.
 *
 * Desktop context seeding (P1 wire-the-loop): on every panel summon the
 * desktop app (show_hummingbird in desktop/src-tauri/src/lib.rs) evals a
 * sessionStorage write of recent local activity (app + window title only)
 * under 'hummingbird_context' into this page; we read it fresh at send time
 * and forward it as context.hummingbird_clips so the twin can ground answers
 * in what the user was just doing. Absent/stale/malformed context degrades
 * to a normal chat.
 */

type ChatErrorType = 'timeout' | 'rate_limit' | 'network' | 'generic';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  failed?: boolean;
  errorType?: ChatErrorType;
}

const API_BASE = API_URL;

const Widget = () => {
  useDocumentTitle('Twin');
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Panel mode: loaded inside the desktop Hummingbird overlay
  // (https://twinme.me/widget?panel=1). Round the corners (the transparent
  // window shows through) and let Esc dismiss the panel. Harmless in a browser.
  const isPanel = new URLSearchParams(window.location.search).get('panel') === '1';

  // Desktop activity context seeded by the desktop app (see module comment).
  // Read at SEND time, not mount time: the panel webview stays alive across
  // summons and the Rust side (show_hummingbird in lib.rs) re-seeds
  // sessionStorage on every summon, so a mount-time snapshot would go stale
  // after the first one. parseHummingbirdContext never throws; the try/catch
  // only guards sessionStorage access itself (blocked storage).
  const readHummingbirdClips = useCallback((): ReturnType<typeof parseHummingbirdContext> => {
    try {
      return parseHummingbirdContext(sessionStorage.getItem(HUMMINGBIRD_CONTEXT_KEY));
    } catch {
      return [];
    }
  }, []);

  // Make the page transparent so the desktop window's rounded corners show
  // through; restore on unmount so other routes are unaffected.
  useEffect(() => {
    if (!isPanel) return;
    const html = document.documentElement;
    const prev = {
      htmlBg: html.style.background,
      bodyBg: document.body.style.background,
      bodyMargin: document.body.style.margin,
    };
    html.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.margin = '0';
    return () => {
      html.style.background = prev.htmlBg;
      document.body.style.background = prev.bodyBg;
      document.body.style.margin = prev.bodyMargin;
    };
  }, [isPanel]);

  // Esc closes the panel via the desktop (capabilities/twinme-panel.json grants
  // this window the hide_hummingbird command). No-op in a normal browser.
  useEffect(() => {
    if (!isPanel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const core = (window as unknown as {
        __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } };
      }).__TAURI__?.core;
      core?.invoke?.('hide_hummingbird').catch(() => { /* desktop-only */ });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPanel]);

  const handleSendMessage = useCallback(async () => {
    const trimmed = inputMessage.trim();
    if (!trimmed || !user?.id || isTyping) return;

    if (!navigator.onLine) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        failed: true,
        errorType: 'network',
      }]);
      setInputMessage('');
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    const assistantMsgId = crypto.randomUUID();
    // Snapshot the desktop context fresh for THIS send (re-seeded by the
    // desktop on every panel summon).
    const hummingbirdClips = readHummingbirdClips();

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE}/chat/message?stream=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
          context: {
            platforms: [],
            // Recent desktop activity from the Hummingbird panel (app +
            // window title only) — lets the twin ground "what am I working
            // on" answers. Omitted entirely when there is no fresh context.
            ...(hummingbirdClips.length > 0 ? { hummingbird_clips: hummingbirdClips } : {}),
          },
        }),
      });

      if (response.status === 429) {
        // Both hourly rate limit and monthly quota land on 429. The widget
        // has no banner real-estate, so surface a transient inline hint.
        setMessages(prev => prev.map(m =>
          m.id === userMessage.id ? { ...m, failed: true, errorType: 'rate_limit' as const } : m
        ));
        setIsTyping(false);
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error('Failed to send message');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let firstChunk = true;
      let receivedDoneEvent = false;
      // Per-tool count of outstanding "Checking {tool}..." lines, so each
      // action_result can replace its own loading line (string-identical per
      // tool, so replacing the first occurrence is always safe).
      const pendingActionLines = new Map<string, number>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'chunk') {
              if (firstChunk) {
                firstChunk = false;
                setIsTyping(false);
                setMessages(prev => [...prev, {
                  id: assistantMsgId,
                  role: 'assistant',
                  content: event.content,
                  timestamp: new Date(),
                }]);
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? { ...m, content: m.content + event.content } : m
                ));
              }
            } else if (event.type === 'done') {
              receivedDoneEvent = true;
              if (event.conversationId) setConversationId(event.conversationId);
            } else if (event.type === 'action_start' && typeof event.tool === 'string') {
              // Text-only action rendering: show a loading line that the
              // matching action_result will replace. The trailing blank line
              // keeps later prose chunks from gluing onto the summary.
              const line = summarizeActionStart(event.tool);
              pendingActionLines.set(event.tool, (pendingActionLines.get(event.tool) ?? 0) + 1);
              if (firstChunk) {
                firstChunk = false;
                setIsTyping(false);
                setMessages(prev => [...prev, {
                  id: assistantMsgId,
                  role: 'assistant',
                  content: `${line}\n\n`,
                  timestamp: new Date(),
                }]);
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? { ...m, content: `${m.content}${line}\n\n` } : m
                ));
              }
            } else if (event.type === 'action_result' && typeof event.tool === 'string') {
              const summary = event.success
                ? summarizeActionResult(event.tool, event.data)
                : summarizeActionFailure(event.tool);
              const pendingCount = pendingActionLines.get(event.tool) ?? 0;
              const startLine = summarizeActionStart(event.tool);
              if (pendingCount > 0) pendingActionLines.set(event.tool, pendingCount - 1);
              if (firstChunk) {
                // Result-only stream (no action_start, no chunks yet).
                firstChunk = false;
                setIsTyping(false);
                setMessages(prev => [...prev, {
                  id: assistantMsgId,
                  role: 'assistant',
                  content: `${summary}\n\n`,
                  timestamp: new Date(),
                }]);
              } else {
                setMessages(prev => prev.map(m => {
                  if (m.id !== assistantMsgId) return m;
                  if (pendingCount > 0 && m.content.includes(startLine)) {
                    return { ...m, content: m.content.replace(startLine, summary) };
                  }
                  // No loading line to replace: append instead.
                  return { ...m, content: `${m.content}${summary}\n\n` };
                }));
              }
            } else if (event.type === 'error') {
              setMessages(prev => {
                const hasMsg = prev.some(m => m.id === assistantMsgId);
                if (hasMsg) {
                  return prev.map(m => m.id === assistantMsgId ? { ...m, failed: true, errorType: 'generic' as const } : m);
                }
                return prev.map(m => m.id === userMessage.id ? { ...m, failed: true, errorType: 'generic' as const } : m);
              });
            }
            // action_pending_confirmation is still intentionally ignored —
            // the widget has no approval surface for write tools (Phase 2).
          } catch {
            // Skip malformed SSE lines
          }
        }
      }

      // Loading lines left unresolved (stream died mid-action) become visible
      // failures rather than a permanently spinning "Checking ...".
      for (const [tool, count] of pendingActionLines) {
        if (count <= 0) continue;
        const startLine = summarizeActionStart(tool);
        const failLine = summarizeActionFailure(tool);
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: m.content.split(startLine).join(failLine) } : m
        ));
      }

      // Stream ended without any content chunks and no done event = timeout
      if (firstChunk && !receivedDoneEvent) {
        setMessages(prev => prev.map(m =>
          m.id === userMessage.id ? { ...m, failed: true, errorType: 'timeout' as const } : m
        ));
      }
    } catch (error) {
      const isNetworkError = error instanceof TypeError && error.message === 'Failed to fetch';
      const errorType: ChatErrorType = isNetworkError ? 'network' : 'generic';
      setMessages(prev => {
        const hasAssistantMsg = prev.some(m => m.id === assistantMsgId);
        if (hasAssistantMsg) {
          return prev.map(m => m.id === assistantMsgId ? { ...m, failed: true, errorType } : m);
        }
        return prev.map(m => m.id === userMessage.id ? { ...m, failed: true, errorType } : m);
      });
    } finally {
      setIsTyping(false);
    }
  }, [inputMessage, user?.id, isTyping, conversationId, readHummingbirdClips]);

  const handleRetry = useCallback((content: string, messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    setInputMessage(content);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = useCallback((date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }, []);

  const hasText = inputMessage.trim().length > 0;

  return (
    <div
      className="flex flex-col w-full overflow-hidden"
      style={{
        height: '100dvh',
        background: 'var(--background, #13121a)',
        borderRadius: isPanel ? 16 : undefined,
        border: isPanel ? '1px solid rgba(255,255,255,0.10)' : undefined,
      }}
    >
      {/* ── Slim brand bar ── */}
      <header
        className="flex items-center justify-between flex-shrink-0 px-4 py-2.5"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex items-center gap-2">
          <img
            src="/images/backgrounds/flower-hero.webp"
            alt=""
            className="w-6 h-6"
            style={{ objectFit: 'contain' }}
            aria-hidden="true"
          />
          <span
            className="text-[18px] leading-none"
            style={{
              fontFamily: "'Instrument Serif', serif",
              color: '#F5F5F4',
              letterSpacing: '-0.02em',
            }}
          >
            TwinMe
          </span>
        </div>
        <Link
          to="/talk-to-twin"
          className="flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[12px] font-medium transition-colors"
          style={{ color: 'rgba(245,245,244,0.6)', fontFamily: 'Inter, sans-serif' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#F5F5F4'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(245,245,244,0.6)'; }}
          title="Open the full app"
        >
          Open full app
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </header>

      {/* ── Scrollable message list ── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <img
              src="/images/backgrounds/flower-hero.webp"
              alt=""
              className="w-10 h-10 mb-4 opacity-80"
              style={{ objectFit: 'contain' }}
              aria-hidden="true"
            />
            <p
              className="text-[20px] leading-tight"
              style={{
                fontFamily: "'Instrument Serif', serif",
                color: '#F5F5F4',
                letterSpacing: '-0.02em',
              }}
            >
              Talk to your twin
            </p>
            <p
              className="text-[13px] mt-2 max-w-[280px]"
              style={{ color: 'rgba(245,245,244,0.4)', fontFamily: 'Inter, sans-serif' }}
            >
              Ask anything. Your twin knows your patterns, routines, and what makes you tick.
            </p>
          </div>
        ) : (
          <MessageList
            ref={messagesEndRef}
            messages={messages}
            isTyping={isTyping}
            formatTime={formatTime}
            onRetry={handleRetry}
          />
        )}
      </div>

      {/* ── Bottom-pinned composer ── */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2">
        <div
          className="flex items-end gap-2 rounded-[20px] px-4 py-2.5"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
          }}
        >
          <label htmlFor="widget-chat-input" className="sr-only">
            Message your twin
          </label>
          <textarea
            id="widget-chat-input"
            ref={inputRef}
            placeholder="Message your twin..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="Message your twin"
            className="flex-1 resize-none focus:outline-none text-[14px] bg-transparent placeholder:text-[rgba(255,255,255,0.3)]"
            style={{
              color: 'var(--foreground, #F5F5F4)',
              minHeight: '24px',
              maxHeight: '120px',
              caretColor: 'var(--accent-vibrant, #F5F5F4)',
              fontFamily: 'Inter, sans-serif',
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!hasText || isTyping}
            aria-label={isTyping ? 'Twin is responding' : 'Send message'}
            className="flex items-center justify-center transition-all duration-150 ease-out hover:brightness-110 active:scale-95"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '100px',
              padding: '6px',
              background: hasText && !isTyping ? '#F5F5F4' : 'rgba(255,255,255,0.06)',
              color: hasText && !isTyping ? '#110f0f' : 'rgba(255,255,255,0.2)',
              cursor: (!hasText || isTyping) ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            {isTyping ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Widget;
