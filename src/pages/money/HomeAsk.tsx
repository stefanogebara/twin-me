import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { useT } from '@/lib/i18n';

export default function HomeAsk() {
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();
  const t = useT();
  return (
    <form className="mv-home-ask" onSubmit={(e) => {
      e.preventDefault();
      navigate('/money/chat', { state: { draft: draft.trim() } });
    }}>
      <label className="mv-sr" htmlFor="money-home-ask">{t('Ask about your money')}</label>
      <input id="money-home-ask" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder={t('Ask about your money')} />
      <button type="submit" className="mv-icon-btn" aria-label={t('Open conversation')}><ArrowUp size={18} aria-hidden="true" /></button>
    </form>
  );
}
