import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { ownCurrency, moneyAPI, type MoneyStatementAccount } from '@/services/api/moneyAPI';

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
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

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
    if (!file || !accountId || busy || !accounts) return;
    setBusy(true); setError(null); setResult(null);
    try {
      let selected = accountId;
      if (selected === 'new') {
        const created = await moneyAPI.createStatementAccount(name.trim());
        if (!active.current) return;
        setAccounts((rows) => [...(rows || []).filter((a) => a.id !== created.id), created]);
        setAccountId(created.id); selected = created.id;
      }
      const r = await moneyAPI.importStatement(file, selected);
      if (!active.current) return;
      setResult(t('{read} read, {created} added, {skipped} skipped.', r));
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
    {open && <div className="mv-body mv-body--icon" id="statement-import-form">
      {loading && <p role="status">{t('Loading accounts…')}</p>}
      {accounts !== null && <form className="mv-feed" onSubmit={(e) => void submit(e)}>
        <label htmlFor="statement-account">{t('Statement account')}</label>
        <select className="mv-field" id="statement-account" required value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={busy}>
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
        <input ref={input} className="mv-statement-file" id="statement-file" type="file" accept=".xlsx,.xls,.csv,.txt,.tsv" required disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] || null)} aria-describedby="statement-format" />
        <p className="mv-quiet" id="statement-format">{t('Euro statements, one account per file. Dates use day/month/year.')}</p>
        <div><button className="mv-pill" type="submit" disabled={busy}>{busy ? t('Reading…') : t('Import statement')}</button></div>
      </form>}
      {error && <p role="alert">{error}</p>}
      {error && accounts === null && <button type="button" className="mv-pill mv-pill--ghost" disabled={loading} onClick={() => void loadAccounts()}>{t('Try again')}</button>}
      {result && <p role="status">{result}</p>}
    </div>}
  </>;
}
