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
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        {/* Quick chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => submit(chip)}
              className="rounded-full text-xs px-3 py-1.5 cursor-pointer transition-colors duration-150 border-none hover:brightness-125"
              style={{
                background: 'rgba(255,255,255,0.06)',
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
            className="flex items-center justify-center rounded-full border-none cursor-pointer flex-shrink-0"
            style={{
              width: 32,
              height: 32,
              background: '#252222',
            }}
          >
            <ArrowUp size={16} style={{ color: 'var(--foreground)' }} />
          </button>
        </form>
      </div>
    </section>
  );
}
