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
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
          boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Quick chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => submit(chip)}
              className="rounded-[46px] text-xs px-3 py-2.5 cursor-pointer transition-all duration-150 ease-out hover:brightness-125 active:scale-[0.97]"
              style={{
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid var(--glass-surface-border)',
                color: 'var(--text-secondary)',
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
            style={{ color: 'var(--foreground)' }}
          />
          <button
            type="submit"
            aria-label="Send message"
            className="flex items-center justify-center border-none cursor-pointer flex-shrink-0 transition-all duration-150 ease-out hover:brightness-110 active:scale-90"
            style={{
              width: 28,
              height: 28,
              borderRadius: '100px',
              background: '#252222',
              padding: '4px',
            }}
          >
            <ArrowUp size={16} style={{ color: 'var(--foreground)' }} />
          </button>
        </form>
      </div>
    </section>
  );
}
