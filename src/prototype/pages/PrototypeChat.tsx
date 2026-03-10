import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, ArrowUp, RotateCcw } from 'lucide-react';
import '../sundust.css';

interface Message {
  role: 'twin' | 'user';
  content: string;
  time?: string;
}

const initialMessages: Message[] = [
  {
    role: 'twin',
    content: "Hey Stefano 👋 I've been thinking about you. Your Spotify patterns this morning were different — you went straight to pagode instead of your usual instrumental warm-up. Everything okay, or are you in flow already?",
    time: '9:14 AM',
  },
  {
    role: 'user',
    content: 'Flow mode. Had an idea for a new feature last night and I want to build it today.',
    time: '9:16 AM',
  },
  {
    role: 'twin',
    content: "That's a clear dopaminergic spike — the late-night idea + morning execution energy combo. This is when you do your best work. A few things I noticed that might help:\n\n→ Your 9–11 AM block is unscheduled today. Block it now.\n→ You had 2 deep-work sessions this week — you typically do 3. Today's the day.\n→ Brazilian pagode is already queued — your focus ritual is primed.\n\nWhat's the feature?",
    time: '9:16 AM',
  },
  {
    role: 'user',
    content: 'A voice mode for the twin. Instead of typing, you just talk to me.',
    time: '9:18 AM',
  },
  {
    role: 'twin',
    content: "Voice. Yes — that fits you. Your Whoop data shows you think better when you move, and text forces you to sit. Voice lets you pace.\n\nBased on your patterns: you tend to over-engineer on day one. Build the conversation loop first — don't touch TTS until you can speak to me and get a response back. Start with the smallest thing that could possibly work.",
    time: '9:19 AM',
  },
];

const suggestions = [
  { icon: '✦', text: 'What should I focus on today?' },
  { icon: '◎', text: 'Analyze my energy this week' },
  { icon: '❋', text: 'What patterns am I missing?' },
  { icon: '⬡', text: 'Tell me something surprising about me' },
];

export default function PrototypeChat() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: 'user', content: text, time: now }]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        role: 'twin',
        content: "That's a great question. Based on what I know about you — your Spotify patterns, your calendar blocks, and our previous conversations — I'm seeing something interesting here. Let me think about this more carefully and give you a real answer, not a generic one.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }, 2000);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Chat header */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--sd-separator)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)' }}>Your Twin</div>
          <div style={{ fontSize: 12, color: 'var(--sd-text-muted)' }}>16,482 memories · 5 platforms · Ready</div>
        </div>
        <button
          className="sd-btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          onClick={() => setMessages([])}
        >
          <RotateCcw size={12} /> New chat
        </button>
      </div>

      {/* Messages */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}
        className="sd-scroll"
      >
        {messages.length === 0 && (
          <div className="sd-empty-state" style={{ paddingTop: 80 }}>
            <div style={{ fontSize: 28 }}>◎</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--sd-text-secondary)' }}>Start a conversation</div>
            <div style={{ fontSize: 13, color: 'var(--sd-text-muted)' }}>Your twin knows you. Ask anything.</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'twin' && (
              <div style={{ fontSize: 11, color: 'var(--sd-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', overflow: 'hidden' }}>
                  <img src="/images/backgrounds/flower.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                Twin · {msg.time}
              </div>
            )}
            <div
              className={msg.role === 'user' ? 'sd-bubble-user' : 'sd-bubble-twin'}
              style={{ whiteSpace: 'pre-line', lineHeight: 1.65 }}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div style={{ fontSize: 11, color: 'var(--sd-text-muted)', marginTop: 4 }}>{msg.time}</div>
            )}
          </div>
        ))}

        {isTyping && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 11, color: 'var(--sd-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', overflow: 'hidden' }}>
                <img src="/images/backgrounds/flower.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              Twin is thinking...
            </div>
            <div className="sd-typing">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '16px 24px', flexShrink: 0, borderTop: '1px solid var(--sd-separator)' }}>
        {messages.length <= initialMessages.length && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {suggestions.map((s, i) => (
              <button key={i} className="sd-chip" onClick={() => send(s.text)}>
                <span style={{ fontSize: 12 }}>{s.icon}</span>
                {s.text}
              </button>
            ))}
          </div>
        )}
        <div className="sd-chatbox" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask your twin anything..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--sd-fg)',
                fontSize: 14,
                fontFamily: 'Inter, sans-serif',
                resize: 'none',
                minHeight: 40,
                maxHeight: 120,
                lineHeight: 1.5,
              }}
              rows={1}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(17,15,15,0.25)', border: '1px solid var(--sd-glass-border)',
                borderRadius: 200, padding: '2px 8px', color: 'var(--sd-text-secondary)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}>
                <Paperclip size={12} /> Attach
              </button>
              <button className="sd-send-btn" disabled={!input.trim()} onClick={() => send(input)}>
                <ArrowUp size={14} color="#fdfcfb" />
              </button>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--sd-text-muted)', textAlign: 'center', marginTop: 8 }}>
          Your twin uses your connected platform data to personalize responses
        </div>
      </div>
    </div>
  );
}
