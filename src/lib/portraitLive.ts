/**
 * Maps the /api/portrait response to PortraitData, defensively: the page must never
 * crash on a partial payload, and every reading it shows must carry two receipts.
 */
import type { Domain, PortraitData, Reading, Verdict } from '../data/demoPortrait';

const DOMAINS: Domain[] = ['motivation', 'personality', 'cultural', 'social', 'lifestyle'];
const VERDICTS = new Set(['true', 'partly', 'wrong']);

type Json = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function toReading(raw: Json): Reading | null {
  const evidence = arr<Json>(raw.evidence)
    .map((e) => ({ source: str(e.source, 'unknown'), at: str(e.at), event: str(e.event) }))
    .filter((e) => e.event);
  if (!str(raw.id) || !str(raw.text) || evidence.length < 2) return null;
  const domain = DOMAINS.includes(raw.domain as Domain) ? (raw.domain as Domain) : 'personality';
  const verdict: Verdict = VERDICTS.has(raw.verdict as string) ? (raw.verdict as Exclude<Verdict, null>) : null;
  return {
    id: str(raw.id),
    domain,
    text: str(raw.text),
    sourceReflection: str(raw.sourceReflection, str(raw.id)),
    evidence,
    writtenAt: str(raw.writtenAt).slice(0, 10),
    supportedAt: str(raw.supportedAt).slice(0, 10) || str(raw.writtenAt).slice(0, 10),
    verdict,
    verdictNote: str(raw.verdictNote) || undefined,
  };
}

export function toPortraitData(payload: unknown): PortraitData {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Json;
  const readings = arr<Json>(p.readings).map(toReading).filter((r): r is Reading => r !== null);
  const ids = new Set(readings.map((r) => r.id));
  const signature = arr<Json>(p.signature)
    .filter((s) => DOMAINS.includes(s.domain as Domain) && str(s.line))
    .map((s) => ({ domain: s.domain as Domain, line: str(s.line), from: arr<string>(s.from).filter((id) => ids.has(id)) }));
  const q = p.question && typeof p.question === 'object' ? (p.question as Json) : null;
  const question = q && str(q.question)
    ? {
        fromReadings: arr<string>(q.fromReadings).filter((id) => ids.has(id)),
        source: str(q.source) || undefined,
        evidenceLine: str(q.evidenceLine),
        question: str(q.question),
        answers: arr<string>(q.answers).filter(Boolean).slice(0, 3),
        yourAnswer: typeof q.yourAnswer === 'string' ? q.yourAnswer : null,
      }
    : null;
  return {
    owner: str(p.owner, 'Your'),
    sources: arr<Json>(p.sources).map((s) => ({
      platform: str(s.platform), label: str(s.label, str(s.platform)), read: str(s.read), since: str(s.since).slice(0, 10), kinds: str(s.kinds),
    })).filter((s) => s.platform),
    question,
    signature,
    readings,
    ask: [],
  };
}
