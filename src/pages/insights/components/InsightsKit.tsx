/**
 * What the five platform insights pages share, in the register
 * (src/styles/register-insights.css on top of the page kit): each page is a
 * PageHead, then sections of a heading, one grey line and a list of rows.
 * Charts stay charts, but sit in a list item under a section heading.
 */
import React from 'react';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Page, PageHead, Section, List, Row } from '@/components/register';
import { PatternObservation } from './TwinReflection';
import '@/styles/register-public.css';
import '@/styles/register-insights.css';

/** Signature hues for parts of a whole, in a fixed order (register.css). */
export const HUES = [
  'var(--rg-iris)',
  'var(--rg-verdigris)',
  'var(--rg-ember)',
  'var(--rg-orchid)',
  'var(--rg-periwinkle)',
  'var(--rg-signal)',
];

interface Pattern {
  id: string;
  text: string;
  occurrences: 'often' | 'sometimes' | 'noticed';
}

interface HistoryItem {
  id: string;
  text: string;
  generatedAt: string;
}

export function PatternsSection({ patterns }: { patterns?: Pattern[] }) {
  if (!patterns || patterns.length === 0) return null;
  return (
    <Section title="Patterns">
      <List>
        {patterns.map(pattern => (
          <PatternObservation key={pattern.id} text={pattern.text} occurrences={pattern.occurrences} />
        ))}
      </List>
    </Section>
  );
}

export function HistorySection({ history }: { history?: HistoryItem[] }) {
  if (!history || history.length === 0) return null;
  return (
    <Section title="Past observations">
      <List>
        {history.map(past => (
          <Row key={past.id} title={past.text} line={new Date(past.generatedAt).toLocaleDateString()} />
        ))}
      </List>
    </Section>
  );
}

/** The reflection is still being written, but the platform's data is here. */
export function PendingReflection({ what }: { what: string }) {
  return (
    <Section title="What your twin noticed">
      <List>
        <Row title="Not ready yet" line={`Your twin is still reading your ${what}. Check back soon.`} />
      </List>
    </Section>
  );
}

/**
 * Nothing to show: either the platform is not connected (one row, one ink
 * primary) or it is and the data has not arrived yet (one row, no action).
 */
export function InsightsNotice({
  notConnected,
  platform,
  connectLine,
  title,
  line,
  onConnect,
}: {
  notConnected: boolean;
  platform: string;
  connectLine: string;
  title: string;
  line: string;
  onConnect: () => void;
}) {
  return (
    <Section>
      <List className="pb-stack">
        {notConnected ? (
          <Row
            title={`${platform} is not connected`}
            line={connectLine}
            action={
              <button type="button" className="n-btn n-btn--primary" onClick={onConnect}>
                Connect {platform}
              </button>
            }
          />
        ) : (
          <Row title={title} line={line} />
        )}
      </List>
    </Section>
  );
}

/** A page that could not load: its title, the reason as a row, one action. */
export function InsightsError({
  title,
  message,
  actionLabel,
  onAction,
  busy = false,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
}) {
  return (
    <Page>
      <PageHead title={title} />
      <List className="pb-stack">
        <Row
          title={message}
          action={
            <button type="button" className="n-btn n-btn--primary" onClick={onAction} disabled={busy}>
              {busy ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
              {actionLabel}
            </button>
          }
        />
      </List>
    </Page>
  );
}

const Bar: React.FC<{ width: string; height?: number }> = ({ width, height = 12 }) => (
  <span className="block animate-pulse" style={{ width, height, borderRadius: 4, background: 'var(--rg-field)' }} />
);

/** The cold start: the page's shape in the field colour while the reflection is written. */
export function InsightsSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading">
        <PageHead
          title={<Bar width="45%" height={36} />}
          line={<span style={{ display: 'block', marginTop: 8 }}><Bar width="30%" /></span>}
        />
        {Array.from({ length: sections }).map((_, s) => (
          <Section key={s} title={<Bar width="30%" height={28} />}>
            <List>
              {[0, 1, 2].map(i => (
                <li key={i} className="rg-row rg-row--plain">
                  <span className="rg-row-text" style={{ gap: 8 }}>
                    <Bar width="30%" />
                    <Bar width={`${50 + i * 8}%`} />
                  </span>
                  <span />
                </li>
              ))}
            </List>
          </Section>
        ))}
      </div>
    </Page>
  );
}

/** A row with a thin data bar under its title and the figure at its end. */
export function BarRow({ title, share, end, color }: { title: ReactNode; share: number; end: ReactNode; color?: string }) {
  const width = share > 0 ? Math.max(1, Math.min(100, share)) : 0;
  return (
    <li className="rg-row rg-row--plain">
      <span className="rg-row-text">
        <span className="rg-row-title">{title}</span>
        <span className="ri-bar" aria-hidden="true">
          <i style={{ width: `${width}%`, background: color }} />
        </span>
      </span>
      <span className="rg-row-action ri-end">{end}</span>
    </li>
  );
}

/** Parts of a whole as one bar of signature marks, then a legend that names each. */
export function MixBar({ parts }: { parts: Array<{ key: string; label: ReactNode; share: number; color: string }> }) {
  return (
    <>
      <div className="ri-mix" aria-hidden="true">
        {parts.map(part => (
          <i key={part.key} style={{ flexGrow: Math.max(part.share, 0), background: part.color }} />
        ))}
      </div>
      <ul className="ri-legend">
        {parts.map(part => (
          <li key={part.key}>
            <span className="ri-swatch" style={{ background: part.color }} aria-hidden="true" />
            {part.label}
          </li>
        ))}
      </ul>
    </>
  );
}
