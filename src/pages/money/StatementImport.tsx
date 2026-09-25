import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { ownCurrency, moneyAPI, type MoneyStatementAccount, type StatementNeeds } from '@/services/api/moneyAPI';

/** Keep the account decision next to the file, before any ledger write. */
export default function StatementImport({ onImported }: { onImported: () => Promise<void> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<MoneyStatementAccount[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [needs, setNeeds] = useState<StatementNeeds | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const questionsAnswered = !needs || needs.questions.every(q => q.choices.some(choice => choice.value === answers[q.id]));
  function resetInterpretation() { setNeeds(null); setAnswers({}); setResult(null); setError(null); }

  async function loadAccounts() {
    setLoading(true); setError(null);
    try {
      const rows = await moneyAPI.statementAccounts();
      if (active.current) setAccounts(rows.filter((a) => ownCurrency(a.currency)));
    } catch { if (active.current) setError(t('Your accounts could not be loaded. Try again.')); }
    finally { if (active.current) setLoading(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !accountId || busy || !accounts || !questionsAnswered) return;
    setBusy(true); setError(null); setResult(null);
    try {
      let selected = accountId;
      if (selected === 'new') {
        const created = await moneyAPI.createStatementAccount(name.trim());
        if (!active.current) return;
        setAccounts((rows) => [...(rows || []).filter((a) => a.id !== created.id), created]);
        setAccountId(created.id); selected = created.id;
      }
      const r = await moneyAPI.importStatement(file, selected, needs ? { plan: needs.plan, answers, confirm: needs.questions.length === 0 } : undefined);
      if (!active.current) return;
      if (r.kind === 'needs') { setNeeds(r.needs); return; }
      setResult(t('{read} read, {created} added, {skipped} skipped.', r) + (r.deferred ? ' ' + t('{n} observations need review before they can count as spending.', { n: r.deferred }) : '') + (r.ignored_deleted ? ' ' + t('{n} previously removed payments were not added again.', { n: r.ignored_deleted }) : ''));
      setNeeds(null); setAnswers({});
      setFile(null); if (input.current) input.current.value = '';
      await onImported();
    } catch (e) { if (active.current) setError(t(e instanceof Error ? e.message : 'Those rows could not be read.')); }
    finally { if (active.current) setBusy(false); }
  }

  return <>
    <button type="button" className="mv-item mv-item--icon" aria-expanded={open} aria-controls="statement-import-form"
      onClick={() => { setOpen(!open); if (!open && accounts === null && !loading) void loadAccounts(); }}>
      <span className="mv-icon" aria-hidden="true"><FileText size={16} /></span>
      <span className="mv-item-text"><span className="mv-item-title">{t('Add a statement')}</span>
        <span className="mv-item-sub">{t('Import from Excel or CSV.')}</span></span>
      <ChevronRight className="mv-chev" size={16} aria-hidden="true" />
    </button>
    <div className="mv-body mv-body--icon" id="statement-import-form" hidden={!open}>
      {loading && <p role="status">{t('Loading accounts…')}</p>}
      {accounts !== null && <form className="mv-feed" onSubmit={(e) => void submit(e)}>
        <label htmlFor="statement-account">{t('Statement account')}</label>
        <select className="mv-field" id="statement-account" required value={accountId} onChange={(e) => { setAccountId(e.target.value); resetInterpretation(); }} disabled={busy}>
          <option value="">{t('Choose an account')}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || t('The bank')}{a.iban_mask ? ` · ${a.iban_mask.slice(-4)}` : ''}{a.provider === 'statement' ? ` · ${t('Statements only')}` : ''}</option>)}
          <option value="new">{t('Add a statement-only account')}</option>
        </select>
        {accounts.find((a) => a.id === accountId)?.iban_mask && <p className="mv-quiet">{accounts.find((a) => a.id === accountId)?.iban_mask}</p>}
        {accountId === 'new' && <>
          <label htmlFor="statement-account-name">{t('Account name')}</label>
          <input className="mv-field" id="statement-account-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder={t('Everyday account')} />
          <p className="mv-quiet">{t('A name for your imports. This does not connect to your bank.')}</p>
        </>}
        <label htmlFor="statement-file">{t('Statement file')}</label>
        <input ref={input} className="mv-statement-file" id="statement-file" type="file" accept=".xlsx,.xls,.csv,.txt,.tsv,.pdf" required disabled={busy}
          onChange={(e) => { setFile(e.target.files?.[0] || null); resetInterpretation(); }} aria-describedby="statement-format" />
        <p className="mv-quiet" id="statement-format">{t('Excel, CSV or a PDF from your bank. One account per file.')}</p>
        {needs && <fieldset disabled={busy} className="mv-feed">
          <legend>{t('Check how to read this file')}</legend>
          <p role="status" className="mv-quiet">{t('Nothing has been imported yet.')}</p>
          {needs.questions.map(q => <React.Fragment key={q.id}>
            <label htmlFor={`statement-answer-${q.id}`}>{q.id === 'sign' ? t('Is this money out or money in?') : q.id === 'year' ? t('Which year should dates without a year use?') : q.id === 'dateOrder' ? t('How are the dates written?') : t('What currency are these in?')}</label>
            <select className="mv-field" id={`statement-answer-${q.id}`} required value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}>
              <option value="">{t('Choose an answer')}</option>
              {q.choices.map(choice => <option key={choice.value} value={choice.value}>{t(choice.label)}</option>)}
            </select>
          </React.Fragment>)}
          {needs.questions.length === 0 && <>
            <p>{t('{read} ready to import, {skipped} skipped.', { read: needs.read, skipped: needs.skipped })}</p>
            {needs.skipped > 0 && <p role="alert">{t('Some rows could not be read. Check your file before importing.')}</p>}
            <p className="mv-quiet">{t('Check the first payments below, including their dates and whether money went in or out.')}</p>
            <ul className="mv-statement-preview">
              {needs.preview.map((row, i) => <li key={i}>
                <span>{row.day} · {row.name || t('Unknown')}</span>
                <span>{row.direction === 'out' ? t('Money out') : t('Money in')} · {row.amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}</span>
              </li>)}
            </ul>
          </>}
        </fieldset>}
        <div><button className="mv-pill" type="submit" disabled={busy || !questionsAnswered || (needs?.questions.length === 0 && needs.read === 0)}>{busy ? t('Reading…') : needs ? (needs.questions.length ? t('Review import') : t('Confirm and import')) : t('Import statement')}</button></div>
      </form>}
      {error && <p role="alert">{error}</p>}
      {error && accounts === null && <button type="button" className="mv-pill mv-pill--ghost" disabled={loading} onClick={() => void loadAccounts()}>{t('Try again')}</button>}
      {result && <p role="status">{result}</p>}
    </div>
  </>;
}
