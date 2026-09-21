/**
 * What the ledger worked out itself, beside what the person told it.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import Wait from '../../../../components/Wait';
import { orbFor } from '../../orbFor';
import { readingWords } from '../../readingWords';
import type { MoneyAccount } from '../../useMoneyAccount';
import { worthShowing } from '../../patternKinds';

export default function Noticed({ m }: { m: MoneyAccount }) {
  const { t, locale, patterns } = m;
  return (
          <section className="mv-section" id="noticed">
            <h2>{t('What it worked out on its own.')}</h2>
            <p className="mv-sub">{t('Nobody typed these. They are what your own payments repeat.')}</p>
            <ul className="mv-list">
              {patterns === null ? (
                <li><Wait inline state={orbFor('learning')} line="Reading your payments." /></li>
              ) : patterns.length === 0 ? (
                <li><p className="mv-empty">{t('Nothing it can say yet. It needs a few more weeks of payments.')}</p></li>
              ) : patterns.filter((f) => worthShowing(f.kind)).length === 0 ? (
                <li><p className="mv-empty">{t('Nothing it can say yet. It needs a few more weeks of payments.')}</p></li>
              ) : patterns.filter((f) => worthShowing(f.kind)).map((f) => {
                const said = readingWords(f, t, locale);
                return (
                  <li key={f.kind + f.sentence} className="mv-item">
                    <span className="mv-item-text">
                      <span className="mv-item-title">{said.sentence}</span>
                      {said.detail ? <span className="mv-item-sub">{said.detail}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
  );
}
