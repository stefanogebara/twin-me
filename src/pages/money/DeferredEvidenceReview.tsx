import '../../styles/money-review.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useT } from '@/lib/i18n';
import { moneyAPI, type MoneyReview } from '../../services/api/moneyAPI';

/** A source observation is not another payment until the person explicitly says so. */
export default function DeferredEvidenceReview({ onResolved }: { onResolved: () => void }) {
  const t = useT(); const locale = useLocale();
  const [review, setReview] = useState<MoneyReview | null>(null);
  const [choice, setChoice] = useState('');
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(async (start = 0) => {
    const mine = ++seq.current; setLoading(true); setChoice('');
    try { const r = await moneyAPI.reconciliationReview(start); if (mine !== seq.current) return; setReview(r); setIndex(0); setOffset(start); setFailed(false); setConflict(false); }
    catch { if (mine !== seq.current) return; setReview(null); setFailed(true); }
    finally { if (mine === seq.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { seq.current++; }; }, [load]);
  const item = review?.items[index];
  async function confirm() {
    if (!review || !item || !choice || busy || conflict || loading) return;
    setBusy(true);
    try {
      await moneyAPI.resolveEvidence(item.id, choice === 'separate'
        ? { revision: review.revision, action: 'separate' }
        : { revision: review.revision, action: 'match', transactionId: choice });
      onResolved(); await load();
    } catch { setConflict(true); setChoice(''); }
    finally { setBusy(false); }
  }
  const amount = (n: number, c: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: c }).format(n);
  const when = (at: string) => new Date(at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return <div className="mv-review" id="payment-review" aria-busy={loading || busy}>
    <h3>{t('Review payment observations')}</h3>
    <p className="mv-sub">{t('These observations are excluded from spending until you match or confirm them.')}</p>
    {loading ? <p role="status">{t('Reading payment observations…')}</p> : failed ? <p role="alert">{t('Payment observations could not be read.')}</p>
      : !item ? <p role="status">{t('No payment observations need review.')}</p> : <>
      <p>{item.merchant || t('Unnamed payment')} · {amount(item.amount, item.currency)}</p>
      <p className="mv-sub">{when(item.occurred_at)} · {t(item.source)}</p>
      <fieldset disabled={busy || conflict} className="mv-review-choices">
        <legend>{t('Which payment does this observation describe?')}</legend>
        {item.candidates.map(c => <label key={c.id} className="mv-item">
          <input type="radio" name={`payment-${item.id}`} value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} />
          <span>{c.merchant || t('Unnamed payment')} · {amount(c.amount, c.currency)}<span className="mv-item-sub">{when(c.occurred_at)}{c.accountLabel ? ` · ${c.accountLabel}` : ''}</span></span>
        </label>)}
        {item.candidateOverflow ? <p className="mv-sub">{t('Only the first matching payments are shown. Leave this observation unresolved if yours is missing.')}</p> : null}
        <label className="mv-item"><input type="radio" name={`payment-${item.id}`} value="separate" checked={choice === 'separate'} onChange={() => setChoice('separate')} /><span>{t('This was a separate payment')}<span className="mv-item-sub">{t('Add it once to the ledger.')}</span></span></label>
      </fieldset>
      {conflict ? <p role="alert">{t('Your choice was not confirmed. Reload the choices before trying again.')}</p> : null}
      <button type="button" className="mv-pill" disabled={!choice || busy || conflict} onClick={() => void confirm()}>{t('Confirm choice')}</button>
      {index > 0 || offset > 0 ? <button type="button" className="mv-link" disabled={busy || conflict} onClick={() => { setChoice(''); if(index > 0) setIndex(index - 1); else void load(Math.max(0, offset - 20)); }}>{t('Previous observation')}</button> : null}
      {index + 1 < review.items.length || review.nextOffset !== null ? <button type="button" className="mv-link" disabled={busy || conflict} onClick={() => { setChoice(''); if(index + 1 < review.items.length) setIndex(index + 1); else if(review.nextOffset !== null) void load(review.nextOffset); }}>{t('Next observation')}</button> : null}
      {review.remaining > 0 || review.items.length > 1 ? <p className="mv-sub">{t('More observations remain. Each needs its own confirmation.')}</p> : null}
    </>}
    {(failed || conflict) && <button type="button" className="mv-pill mv-pill--ghost" disabled={loading || busy} onClick={() => void load()}>{t('Reload choices')}</button>}
  </div>;
}
