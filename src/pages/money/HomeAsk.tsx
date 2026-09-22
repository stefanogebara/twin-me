import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      {/* The word, not an arrow in a black square: that square is another product's input. */}
      <button type="submit" className="mv-ask-go">{t('Ask')}</button>
    </form>
  );
}
