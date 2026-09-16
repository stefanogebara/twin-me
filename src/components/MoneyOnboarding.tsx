/**
 * The first minutes with TwinMe, over the money pages, in three steps a person can leave.
 *
 *   language   which language TwinMe speaks (LanguageAsk), asked once
 *   banks      the banks it can read, each with Connect; the bank's consent returns here and
 *              the account is listed; connect another, or press Next
 *   places     where they live, study and work, found on Places and confirmed as facts the
 *              ledger reads with everything else
 *
 * A step shows only while it has something to ask: no language yet, no bank connected, no
 * place known. Next or Not now puts a step to rest on this browser; a connected account or
 * a kept place puts it to rest everywhere. `?start=banks` or `?start=places` opens a step
 * on purpose, for a person who wants to come back to it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import LanguageAsk from './LanguageAsk';
import { moneyAPI, BANKS, bankLabel, type MoneyAccount, type MoneyFact, type PlaceHit } from '@/services/api/moneyAPI';
import { APK_URL, SHORTCUT_URL, phoneKind } from '@/lib/downloads';
import '@/styles/money-v2.css';
import { useT } from '@/lib/i18n';

type Step = 'language' | 'banks' | 'places' | 'phone';
const SKIP = (step: Step) => `mv-start-skip:${step}`;
const skipped = (step: Step) => { try { return localStorage.getItem(SKIP(step)) === '1'; } catch { return false; } };
const skip = (step: Step) => { try { localStorage.setItem(SKIP(step), '1'); } catch { /* a courtesy */ } };

export default function MoneyOnboarding() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<MoneyAccount[] | null>(null);
  const [facts, setFacts] = useState<MoneyFact[] | null>(null);
  const [rested, setRested] = useState<Record<string, boolean>>({});
  const [languageDone, setLanguageDone] = useState(false);
  const forced = useMemo(() => { const s = new URLSearchParams(window.location.search).get('start'); return s === 'banks' || s === 'places' || s === 'phone' ? (s as Step) : null; }, []);

  const load = useCallback(async () => {
    const [a, f] = await Promise.allSettled([moneyAPI.accounts(), moneyAPI.facts()]);
    setAccounts(a.status === 'fulfilled' ? a.value : []);
    setFacts(f.status === 'fulfilled' ? f.value : []);
  }, []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const language = (user as { preferred_language?: string | null } | null)?.preferred_language;
  const hasPlace = (facts || []).some((f) => ['home_area', 'study_place', 'work_place'].includes(f.kind));
  const step: Step | null = !user || accounts === null || facts === null ? null
    : forced && !rested[forced] ? forced
      : language === null && !languageDone ? 'language'
        : accounts.length === 0 && !skipped('banks') && !rested.banks ? 'banks'
          : !hasPlace && !skipped('places') && !rested.places ? 'places'
            : !skipped('phone') && !rested.phone ? 'phone'
              : null;

  if (!step) return null;
  const rest = (s: Step) => { skip(s); setRested((r) => ({ ...r, [s]: true })); };
  if (step === 'language') return <LanguageAsk onDone={() => setLanguageDone(true)} />;
  if (step === 'banks') return <BanksStep accounts={accounts || []} onNext={() => rest('banks')} />;
  if (step === 'places') return <PlacesStep facts={facts || []} onNext={() => rest('places')} onKept={load} />;
  return <PhoneStep onNext={() => rest('phone')} />;
}

/**
 * The phone, last, because it is the only source that sees a payment the moment it happens:
 * the bank's own feed is a day or two behind. What the phone can do differs by make, and the
 * step shows the one in the person's hand rather than both with a caveat.
 */
function PhoneStep({ onNext }: { onNext: () => void }) {
  const t = useT();
  const kind = phoneKind();
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function makeKey() {
    setBusy(true); setNote(null);
    try { setKey(await moneyAPI.createCaptureKey()); }
    catch (e) { setNote((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="mv la" role="dialog" aria-modal="true" aria-labelledby="la-title">
      <div className="la-col">
        <h1 id="la-title">{t('A payment, the moment it happens.')}</h1>
        <p className="mv-sub">{t('The bank posts a payment a day or two later. Your phone sees it at the till.')}</p>
        {kind !== 'iphone' ? (
          <ul className="mv-list">
            <li className="mv-item">
              <span className="mv-item-text">
                <span className="mv-item-title">{t('Android: the TwinMe app')}</span>
                <span className="mv-item-sub">{t('It reads your bank app and sends each payment on.')}</span>
              </span>
              <span className="mv-item-end"><a className="mv-pill mv-pill--ghost" href={APK_URL}>{t('Get the app')}</a></span>
            </li>
          </ul>
        ) : null}
        {kind !== 'android' ? (
          <ul className="mv-list">
            <li className="mv-item">
              <span className="mv-item-text">
                <span className="mv-item-title">{t('iPhone: a Shortcut')}</span>
                <span className="mv-item-sub">{t('Apple Pay only. No app on iPhone may read notifications.')}</span>
              </span>
              <span className="mv-item-end">
                {key
                  ? <a className="mv-pill mv-pill--ghost" href={SHORTCUT_URL}>{t('Add the shortcut')}</a>
                  : <button type="button" className="mv-pill mv-pill--ghost" disabled={busy} onClick={() => void makeKey()}>{t('Make a key')}</button>}
              </span>
            </li>
            {key ? (
              <li className="mv-item mv-item--sub">
                <span className="mv-item-text">
                  <code className="mv-code">{key}</code>
                  <span className="mv-item-sub">{t('Paste this when the shortcut asks for it. It is shown once.')}</span>
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
        {kind === 'other' ? <p className="mv-quiet">{t('Open this page on your phone to set it up there.')}</p> : null}
        {note ? <p className="mv-note" role="status">{note}</p> : null}
        <div className="mv-ctas"><button type="button" className="mv-pill mv-pill--ghost" onClick={onNext}>{t('Not now')}</button></div>
      </div>
    </div>
  );
}

function BanksStep({ accounts, onNext }: { accounts: MoneyAccount[]; onNext: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /* What the bank's return said, in the person's language. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search); const o = p.get('bank');
    if (!o) return;
    const why = (p.get('why') || '').replace(/[^a-z0-9_ .-]/gi, '').replace(/_/g, ' ').trim();
    setNote(o === 'connected' ? t('{bank} is connected. The first read is on its way.', { bank: bankLabel(p.get('name')) }) : `${t('The bank connection did not go through. Try it again.')}${why ? ` (${why})` : ''}`);
  }, [t]);
  async function connect(bank: string) {
    setBusy(bank); setNote(null);
    try { const { url } = await moneyAPI.connect(bank, 'ES', window.location.pathname); window.location.assign(url); }
    catch { setNote(t('The bank did not answer. Try again in a moment.')); setBusy(null); }
  }
  const mine = (bank: string) => accounts.filter((a) => (a.bank_name || BANKS[0].name) === bank);
  return (
    <div className="mv la" role="dialog" aria-modal="true" aria-labelledby="la-title">
      <div className="la-col">
        <h1 id="la-title">{t('Connect your bank.')}</h1>
        <p className="mv-sub">{t('It reads what comes in and goes out, four times a day. It can never move money. Connect as many as you use, then Next.')}</p>
        <ul className="mv-list">
          {BANKS.map((b) => {
            const rows = mine(b.name);
            return (
              <li key={b.name} className="mv-item">
                <span className="mv-item-text">
                  <span className="mv-item-title">{b.label}</span>
                  <span className="mv-item-sub">{rows.length ? rows.map((a) => `${a.name || 'Account'} ${a.iban_mask || ''}`.trim()).join(', ') : t('Read four times a day. You confirm it every six months.')}</span>
                </span>
                <span className="mv-item-end">
                  {rows.length ? <span className="mv-quiet">{t('Connected')}</span> : <button type="button" className="mv-pill mv-pill--ghost" disabled={busy !== null} onClick={() => void connect(b.name)}>{busy === b.name ? t('Opening') : t('Connect')}</button>}
                </span>
              </li>
            );
          })}
        </ul>
        {note ? <p className="mv-note" role="status">{note}</p> : null}
        <div className="mv-ctas">
          {accounts.length ? <button type="button" className="mv-pill" onClick={onNext}>{t('Next')}</button> : <button type="button" className="mv-pill mv-pill--ghost" onClick={onNext}>{t('Not now')}</button>}
        </div>
      </div>
    </div>
  );
}

type Slot = { kind: 'home_area' | 'study_place' | 'work_place'; title: string; hint: string };
const SLOTS: Slot[] = [
  { kind: 'home_area', title: 'Where you live', hint: 'A district or a town, never an address' },
  { kind: 'study_place', title: 'Where you study', hint: 'A campus or a school, by name' },
  { kind: 'work_place', title: 'Where you work', hint: 'An employer or an office, by name' },
];

function PlacesStep({ facts, onNext, onKept }: { facts: MoneyFact[]; onNext: () => void; onKept: () => Promise<void> }) {
  const t = useT();
  const kept = facts.some((f) => SLOTS.some((s) => s.kind === f.kind));
  return (
    <div className="mv la" role="dialog" aria-modal="true" aria-labelledby="la-title">
      <div className="la-col la-col--wide">
        <h1 id="la-title">{t('Where your days happen.')}</h1>
        <p className="mv-sub">{t('Three places the ledger reads your month against: the walk-to shops, the exam weeks, the salary. Each is a fact you can forget later under Settings.')}</p>
        <ul className="mv-list">
          {SLOTS.map((s) => <PlaceSlot key={s.kind} slot={s} fact={facts.find((f) => f.kind === s.kind) || null} onKept={onKept} />)}
        </ul>
        <div className="mv-ctas">
          <button type="button" className={`mv-pill${kept ? '' : ' mv-pill--ghost'}`} onClick={onNext}>{kept ? t('Next') : t('Not now')}</button>
        </div>
      </div>
    </div>
  );
}

function PlaceSlot({ slot, fact, onKept }: { slot: Slot; fact: MoneyFact | null; onKept: () => Promise<void> }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => {
      (slot.kind === 'home_area' ? moneyAPI.homeSearch(q.trim()) : moneyAPI.placesSearch(q.trim()))
        .then((r) => { if (live) setHits(r); }).catch(() => { if (live) setHits([]); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [q, slot.kind]);
  async function keep(hit: PlaceHit) {
    setBusy(true);
    try {
      if (slot.kind === 'home_area') await moneyAPI.saveHome(hit);
      else await moneyAPI.answerQuestion({ questionId: slot.kind, kind: slot.kind, subject: hit.label, subjectLabel: hit.secondary || undefined, value: hit.label });
      setQ(''); setHits([]); setEditing(false); await onKept();
    } catch { /* the field keeps the words */ } finally { setBusy(false); }
  }
  const kept = fact && !editing;
  return (
    <li className="la-slot">
      <div className="mv-item">
        <span className="mv-item-text">
          <span className="mv-item-title">{t(slot.title)}</span>
          <span className="mv-item-sub">{kept ? String(fact.value || fact.subject) : t(slot.hint)}</span>
        </span>
        <span className="mv-item-end">{kept ? <button type="button" className="mv-pill mv-pill--ghost" onClick={() => setEditing(true)}>{t('Change')}</button> : null}</span>
      </div>
      {!kept ? (
        <div className="la-search">
          <label className="mv-sr" htmlFor={`la-${slot.kind}`}>{t(slot.title)}</label>
          <input id={`la-${slot.kind}`} className="mv-field" type="text" autoComplete="off" value={q} placeholder={slot.kind === 'home_area' ? 'Recoletos, Madrid' : slot.kind === 'study_place' ? 'IE University' : 'The company, or the office'} onChange={(e) => setQ(e.target.value)} disabled={busy} />
          {hits.length ? (
            <ul className="mv-list la-hits" aria-label={`${slot.title}, results`}>
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="mv-item la-hit" disabled={busy} onClick={() => void keep(h)}>
                    <span className="mv-item-text"><span className="mv-item-title">{h.label}</span>{h.secondary ? <span className="mv-item-sub">{h.secondary}</span> : null}</span>
                    <span className="mv-item-end mv-quiet">{t('Keep')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
