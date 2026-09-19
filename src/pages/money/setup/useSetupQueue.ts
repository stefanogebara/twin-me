/**
 * The setup's questions, one at a time: the queue, the answer being typed, the place
 * lookup, and what submitting or skipping does. The page draws; this decides.
 * (Split from MoneySetupPage on 2026-09-19, M2-2b.)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useT } from '@/lib/i18n';
import { moneyAPI, type MoneyFact, type MoneyQuestion, type PlaceHit } from '../../../services/api/moneyAPI';
import { type ListRow, blankRow, slug, listColumns, choiceOptions, parseAmount, parseDay, parseShare } from './setupWords';

export function useSetupQueue() {
  const t = useT();
  const locale = useLocale();
  const [queue, setQueue] = useState<MoneyQuestion[]>([]);
  const [openingCount, setOpeningCount] = useState(0);
  const [answeredBefore, setAnsweredBefore] = useState(0);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  /* Their own words when a choice is not enough: who that is, what it was for. */
  const [extra, setExtra] = useState('');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [facts, setFacts] = useState<MoneyFact[] | null>(null);

  useEffect(() => {
    let live = true;
    moneyAPI.questions()
      .then((q) => {
        if (!live) return;
        setQueue([...q.opening, ...q.fromLedger]);
        setOpeningCount(q.opening.length);
        setAnsweredBefore(q.answered);
      })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);

  const question = queue[index] || null;
  const done = loaded && !failed && queue.length > 0 && index >= queue.length;

  /* Every question starts from an empty answer, and a list question starts with one row
     already open so there is nothing to press before you can type. */
  useEffect(() => {
    setNote(null);
    setText('');
    setChoice(null); setExtra('');
    setRows(question && question.input.startsWith('list:') ? [blankRow()] : []);
  }, [question]);

  useEffect(() => {
    if (!done || facts !== null) return;
    void moneyAPI.facts().then(setFacts).catch(() => setFacts([]));
  }, [done, facts]);

  const columns = useMemo(() => (question && question.input.startsWith('list:') ? listColumns(question.input) : []), [question]);
  const options = useMemo(() => (question && question.input.startsWith('choice:') ? choiceOptions(question.input) : []), [question]);
  const fromLedger = Boolean(question) && index >= openingCount;
  const skippable = Boolean(question?.optional) || fromLedger;

  /* A ledger question carries the merchant's own spelling on its receipts; that reads
     better in the summary than the key the ledger files it under. */
  const subjectLabel = question?.receipts?.[0]?.merchant_raw || undefined;

  /* A place is looked up as it is typed, from the same provider the onboarding uses: a
     person types "Recoletos" and picks their own district rather than spelling it for a
     ledger that will later try to match a supermarket against it (Stefano, 2026-09-16). */
  const isPlace = Boolean(question && question.input.startsWith('place:'));
  const areaKind = question?.input === 'place:area';
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [picked, setPicked] = useState<PlaceHit | null>(null);
  useEffect(() => { setHits([]); setPicked(null); }, [question?.id]);
  useEffect(() => {
    if (!isPlace || picked) return undefined;
    const q = text.trim();
    if (q.length < 2) { setHits([]); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      (areaKind ? moneyAPI.homeSearch(q) : moneyAPI.placesSearch(q))
        .then((r) => { if (live) setHits(r); })
        .catch(() => { if (live) setHits([]); });
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [text, isPlace, areaKind, picked]);

  const filledRows = rows.filter((r) => r.label.trim());
  const answerable = question
    ? question.input.startsWith('list:')
      ? filledRows.length > 0 || skippable
      : question.input === 'text' || question.input.startsWith('place:')
        ? text.trim().length > 0 || skippable
        : Boolean(choice)
    : false;

  const advance = useCallback(() => setIndex((i) => i + 1), []);

  async function submit() {
    if (!question || busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (question.input.startsWith('list:')) {
        if (filledRows.length === 0) { await moneyAPI.skipQuestion(question.id); advance(); return; }
        /* Each row is its own fact: one rent, one phone bill, one grant, each with its
           own amount and day, so the projection can carry them separately. */
        for (const row of filledRows) {
          const label = row.label.trim();
          const amount = columns.includes('amount') ? parseAmount(row.amount) : undefined;
          const day = columns.includes('day') ? parseDay(row.day) : undefined;
          const share = columns.includes('share') ? parseShare(row.share) : undefined;
          await moneyAPI.answerQuestion({
            questionId: question.id,
            kind: question.kind,
            subject: slug(label),
            subjectLabel: label,
            ...(amount === undefined ? {} : { amount }),
            ...(day === undefined ? {} : { day }),
            ...(share === undefined ? {} : { share }),
          });
        }
      } else if (question.input.startsWith('place:')) {
        const value = (picked?.label || text).trim();
        if (!value) { await moneyAPI.skipQuestion(question.id); advance(); return; }
        /* Their home is kept as a point as well as a word, because the ledger measures which
           shops are near it; a place they named is kept as the fact it answers. */
        if (areaKind && picked) await moneyAPI.saveHome(picked);
        else {
          await moneyAPI.answerQuestion({
            questionId: question.id, kind: question.kind, value,
            ...(picked?.secondary ? { subjectLabel: picked.secondary } : {}),
            ...(question.subject ? { subject: question.subject } : {}),
          });
        }
      } else if (question.input === 'text') {
        const value = text.trim();
        if (!value) { await moneyAPI.skipQuestion(question.id); advance(); return; }
        await moneyAPI.answerQuestion({
          questionId: question.id, kind: question.kind, value,
          ...(question.subject ? { subject: question.subject } : {}),
          ...(subjectLabel ? { subjectLabel } : {}),
        });
      } else {
        if (!choice) return;
        await moneyAPI.answerQuestion({
          questionId: question.id, kind: question.kind, value: choice,
          ...(question.subject ? { subject: question.subject } : {}),
          ...(subjectLabel ? { subjectLabel } : {}),
          ...(extra.trim() ? { note: extra.trim() } : {}),
        });
      }
      advance();
    } catch {
      setNote(t('That answer did not save. Try it again.'));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!question || busy) return;
    setBusy(true);
    setNote(null);
    try { await moneyAPI.skipQuestion(question.id); advance(); }
    catch { setNote(t('That did not go through. Try it again.')); }
    finally { setBusy(false); }
  }

  return { queue, setQueue, openingCount, setOpeningCount, answeredBefore, setAnsweredBefore, index, setIndex, loaded, setLoaded, failed, setFailed, text, setText, choice, setChoice, extra, setExtra, rows, setRows, busy, setBusy, note, setNote, facts, setFacts, hits, setHits, picked, setPicked, t, locale, question, done, columns, options, fromLedger, skippable, subjectLabel, isPlace, areaKind, filledRows, answerable, advance, submit, skip };
}
export type SetupQueue = ReturnType<typeof useSetupQueue>;
