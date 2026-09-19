/**
 * The answer to one question: a line of text or a place looked up as it is typed, one
 * choice among a few, or a list of rows with an amount, a day and a share.
 * (Split from MoneySetupPage on 2026-09-19, M2-2b.)
 */
import { cap } from '../factWords';
import { CATEGORIES, SHARES, PLACEHOLDER, blankRow } from './setupWords';
import type { SetupQueue } from './useSetupQueue';

export default function AnswerFields({ q }: { q: SetupQueue }) {
  const { text, setText, choice, setChoice, extra, setExtra, rows, setRows, hits, setHits, picked, setPicked, t, question, columns, options, isPlace, areaKind } = q;
  return (
    <>
      {question.input === 'text' || isPlace ? (
        <div className="ms-field">
          <label className="mv-sr" htmlFor="ms-text">{t('Your answer')}</label>
          <input
            id="ms-text"
            className="mv-field"
            type="text"
            value={text}
            placeholder={isPlace ? t(areaKind ? 'Start typing your district' : 'Start typing the name') : t('Your answer')}
            autoComplete="off"
            role={isPlace ? 'combobox' : undefined}
            aria-expanded={isPlace ? hits.length > 0 : undefined}
            aria-controls={isPlace ? 'ms-hits' : undefined}
            onChange={(e) => { setText(e.target.value); setPicked(null); }}
          />
          {isPlace && hits.length ? (
            <ul id="ms-hits" className="mv-list ms-hits" aria-label={t('{what}, results', { what: t('Your answer') })}>
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="mv-item la-hit"
                    onClick={() => { setPicked(h); setText(h.label); setHits([]); }}
                  >
                    <span className="mv-item-text">
                      <span className="mv-item-title">{h.label}</span>
                      {h.secondary ? <span className="mv-item-sub">{h.secondary}</span> : null}
                    </span>
                    <span className="mv-item-end mv-quiet">{t('Keep')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {isPlace && picked ? <p className="mv-quiet">{picked.secondary || picked.label}</p> : null}
        </div>
      ) : null}

      {question.input === 'category' || question.input.startsWith('choice:') ? (
        <div className="ms-choices" role="group" aria-label={question.input === 'category' ? t('Pick the kind of place') : t('Pick one')}>
          {(question.input === 'category' ? CATEGORIES : options).map((word) => (
            <button
              key={word}
              type="button"
              className="mv-pill mv-pill--ghost"
              aria-pressed={choice === word}
              onClick={() => setChoice(choice === word ? null : word)}
            >
              <span>{cap(t(word))}</span>
            </button>
          ))}
        </div>
      ) : null}
      {/* A choice made, and room to say more: who that is, what it was for. It is kept
          beside the answer and read by the ledger, not filed under a word. */}
      {choice && question.input.startsWith('choice:') ? (
        <div className="ms-field ms-note">
          <label className="mv-label" htmlFor="ms-note">{choice === 'other' ? t('Who is that, or what was it for?') : t('Anything else about it? Optional.')}</label>
          <input id="ms-note" className="mv-field" type="text" autoComplete="off" maxLength={240} placeholder={choice === 'other' ? t('My landlord, the deposit for the ski trip') : ''} value={extra} onChange={(e) => setExtra(e.target.value)} />
        </div>
      ) : null}

      {question.input.startsWith('list:') ? (
        <div className="ms-rows">
          {rows.map((row) => (
            <div key={row.key} className={`ms-row ${columns.includes('share') ? 'ms-row--share' : 'ms-row--three'}`}>
              <div className="ms-field">
                <label className="mv-label" htmlFor={`ms-${row.key}-label`}>{cap(t(columns[0]))}</label>
                <input
                  id={`ms-${row.key}-label`}
                  className="mv-field"
                  type="text"
                  autoComplete="off"
                  placeholder={PLACEHOLDER[columns[0]] ? t(PLACEHOLDER[columns[0]]) : ''}
                  value={row.label}
                  onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))}
                />
              </div>

              {columns.includes('amount') ? (
                <div className="ms-field">
                  <label className="mv-label" htmlFor={`ms-${row.key}-amount`}>{t('Amount, \u20ac')}</label>
                  <input
                    id={`ms-${row.key}-amount`}
                    className="mv-field"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={PLACEHOLDER.amount}
                    value={row.amount}
                    onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))}
                  />
                </div>
              ) : null}

              {columns.includes('day') ? (
                <div className="ms-field">
                  <label className="mv-label" htmlFor={`ms-${row.key}-day`}>{t('Day')}</label>
                  <input
                    id={`ms-${row.key}-day`}
                    className="mv-field"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={PLACEHOLDER.day}
                    value={row.day}
                    onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, day: e.target.value } : r)))}
                  />
                </div>
              ) : null}

              {columns.includes('share') ? (
                <div className="ms-field">
                  <label className="mv-label" htmlFor={`ms-${row.key}-share`}>{t('Your share')}</label>
                  <div className="ms-pct">
                    <input
                      id={`ms-${row.key}-share`}
                      className="mv-field"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={row.share}
                      onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, share: e.target.value } : r)))}
                    />
                    <span>%</span>
                  </div>
                </div>
              ) : null}

              {columns.includes('share') ? (
                <div className="ms-quick">
                  {SHARES.map(([word, pct]) => (
                    <button
                      key={word}
                      type="button"
                      className="mv-pill mv-pill--ghost"
                      aria-pressed={Number(row.share) === pct}
                      onClick={() => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, share: String(pct) } : r)))}
                    >
                      <span>{cap(t(word))}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {rows.length > 1 ? (
                <button type="button" className="mv-pill mv-pill--ghost ms-drop" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                  <span>{t('Remove')}</span>
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" className="mv-pill mv-pill--ghost ms-add" onClick={() => setRows((all) => [...all, blankRow()])}>
            <span>{t('Add another')}</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
