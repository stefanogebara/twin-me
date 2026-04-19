import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '@/services/api/apiBase';
import { SourceChips } from './SourceChips';

interface HeroInsightProps {
  body: string;
  source: string;
  insightId: string;
  sources?: string[];
}

const LABEL_STYLE = 'text-[11px] uppercase tracking-[0.15em] font-medium mb-4';

export function HeroInsight({ body, source, insightId, sources }: HeroInsightProps) {
  const navigate = useNavigate();

  useEffect(() => {
    authFetch(`/insights/proactive/${insightId}/engage`, { method: 'POST' }).catch(() => {});
  }, [insightId]);

  return (
    <section className="mb-10 pb-10" style={{ borderBottom: '1px solid var(--glass-surface-border)' }}>
      <h2 className={LABEL_STYLE} style={{ color: 'var(--text-muted)' }}>
        YOUR TWIN NOTICED
      </h2>
      <p
        className="leading-relaxed"
        style={{ fontSize: '18px', color: 'var(--foreground)' }}
      >
        {body}
      </p>
      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        Based on {source}
      </p>
      <SourceChips sources={sources} />
      <button
        onClick={() => navigate('/talk-to-twin', { state: { prefill: body } })}
        className="mt-3 text-sm bg-transparent border-none cursor-pointer transition-all duration-150 ease-out hover:brightness-150 active:scale-[0.97] p-0"
        style={{ color: 'var(--text-secondary)' }}
      >
        Talk about this &rarr;
      </button>
    </section>
  );
}
