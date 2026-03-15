import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';

const CHIPS = ['How am I doing?', 'Focus tips', 'Something new'];

export function ChatPrompt() {
  const navigate = useNavigate();
  const [text, setText] = useState('');

  const submit = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    navigate('/talk-to-twin', { state: { prefill: trimmed } });
  };

  return (
    <section className="mb-12">
      <div
        className="rounded-[20px] p-4"
        style={{
          background: 'var(--glass-surface-bg, rgba(244,241,236,0.7))',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border, #d9d1cb)',
          boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Quick chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => submit(chip)}
              className="rounded-[46px] text-xs px-3 py-2.5 cursor-pointer transition-colors duration-150 border hover:brightness-95"
              style={{
                background: 'var(--glass-surface-bg, rgba(244,241,236,0.7))',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                borderColor: 'var(--glass-surface-border, #d9d1cb)',
                color: 'var(--text-secondary, #4a4242)',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: '12px',
              }}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input row */}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(text); }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask your twin anything..."
            className="flex-1 bg-transparent text-[15px] outline-none border-none"
            style={{ color: 'var(--foreground, #1b1818)', fontFamily: "'Inter', sans-serif" }}
          />
          <button
            type="submit"
            className="flex items-center justify-center rounded-[100px] border-none cursor-pointer flex-shrink-0"
            style={{
              width: 28,
              height: 28,
              padding: 4,
              background: 'var(--button-bg-dark, #252222)',
            }}
          >
            <ArrowUp size={16} style={{ color: '#fdfcfb' }} />
          </button>
        </form>
      </div>
    </section>
  );
}
