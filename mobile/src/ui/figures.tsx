/**
 * Figures: numbers drawn, in the same ink as the numbers written.
 * ===============================================================
 * A figure here is a bar or a band built from Views, so it renders with no library, no
 * vector runtime and no colour. Ink is the thing being talked about, the strong hairline
 * grey is everything it is compared with, and the card tone is the room left on the track.
 * Every value on a figure is also written next to it in the mono role, so a figure is never
 * the only place a number lives.
 *
 * The server computes every value. A figure lays them out and says nothing of its own.
 */

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { cosmos, dayMonth, euro } from '../constants/cosmos';
import { Body, Hairline, Micro, Row, Small } from './primitives';
import { moneyApi, type ImageSource, type MoneyDayStrip } from '../services/moneyApi';

/* ----------------------------------------------------------------------------------------
 * The shapes a figure can arrive in. Mirrors what POST /money/chat returns.
 * -------------------------------------------------------------------------------------- */

export type FigurePoint = { label: string; value: number; current?: boolean };
export type FigureShare = { label: string; value: number; share: number };
export type FigureRecurring = { label: string; amount: number; cadence: string; next?: string | null };

export type FigureDay = { label: string; value: number; today?: boolean };
export type FigureAhead = { label: string; day: string; amount: number; basis?: string | null };

export type ChatFigure =
  | { kind: 'week'; title?: string; days: FigureDay[] }
  | { kind: 'ahead'; title?: string; items: FigureAhead[] }
  | { kind: 'months'; title?: string; points: FigurePoint[] }
  | { kind: 'weekdays'; title?: string; points: FigurePoint[] }
  | { kind: 'history'; title?: string; points: FigurePoint[] }
  | { kind: 'shares'; title?: string; items: FigureShare[] }
  | { kind: 'recurring'; title?: string; items: FigureRecurring[] }
  | { kind: 'band'; title?: string; month?: string; spent: number; likely: number; low?: number; high?: number };

/* ----------------------------------------------------------------------------------------
 * Band. Ink to what has gone, grey to where the month is likely to land, the rest of the
 * track for the room above that. The p10 to p90 spread belongs in the sentence beside it.
 * -------------------------------------------------------------------------------------- */

export function Band({ spent, likely, high }: { spent: number; likely: number; high?: number }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const max = Math.max(high ?? 0, likely, spent, 1) * 1.08;
  const x = (v: number) => Math.max(0, Math.min(1, v / max)) * width;

  return (
    <View style={s.band}>
      <View style={s.bandTrack} onLayout={onLayout}>
        {width > 0 ? (
          <>
            <View style={[s.bandLikely, { width: x(likely) }]} />
            <View style={[s.bandSpent, { width: x(spent) }]} />
          </>
        ) : null}
      </View>
      <View style={s.between}>
        <Micro tabular>Spent {euro(spent)}</Micro>
        <Micro tabular>Likely {euro(likely)}</Micro>
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------------------------------
 * Strip. The last thirty days under the band: a bar for what each day cost, and behind it,
 * on the days the twin had said a range the night before, that range in the hairline grey.
 * A day that broke its range is drawn in the strong hairline so it reads without colour;
 * the line under the strip says the counts, so the figure is never the only place they live.
 * -------------------------------------------------------------------------------------- */

const STRIP_HEIGHT = 44;

export function Strip({ strip, tomorrow }: { strip: MoneyDayStrip; tomorrow?: { value: number; high: number } | null }) {
  const max = Math.max(1, ...strip.days.map((d) => Math.max(d.total, d.said ? d.said.high : 0)));
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v / max)) * STRIP_HEIGHT);
  const line = [
    `${euro(strip.total)} over the last ${strip.days.length - 1} days, on ${strip.days_with_spend} of them.`,
    strip.said_days ? `The range was given on ${strip.said_days} ${strip.said_days === 1 ? 'day' : 'days'} and held on ${strip.held}.` : '',
    tomorrow ? (tomorrow.value > 0 ? `Tomorrow: usually ${euro(tomorrow.value)}, up to ${euro(tomorrow.high)}.` : `Tomorrow is usually quiet, up to ${euro(tomorrow.high)}.`) : '',
  ].filter(Boolean).join(' ');
  return (
    <View style={s.strip} accessibilityLabel="The last thirty days">
      <View style={s.stripDays}>
        {strip.days.map((d) => (
          <View key={d.day} style={s.stripDay}>
            {d.said ? <View style={[s.stripSaid, { bottom: h(d.said.low), height: Math.max(2, h(d.said.high) - h(d.said.low)) }]} /> : null}
            <View style={[s.stripBar, { height: h(d.total) }, d.today ? s.stripBarToday : null, d.hit === false ? s.stripBarMiss : null]} />
          </View>
        ))}
      </View>
      <View style={s.between}>
        <Micro quiet tabular>{dayMonth(strip.from)}</Micro>
        <Micro quiet tabular>Today</Micro>
      </View>
      <Small>{line}</Small>
    </View>
  );
}

/* ----------------------------------------------------------------------------------------
 * Bars. Vertical, one per point, the current one in ink. A value sits over every bar and a
 * label under it, so the figure reads with the eyes closed to the bars.
 * -------------------------------------------------------------------------------------- */

const BAR_HEIGHT = 96;

export function Bars({ points, compact }: { points: FigurePoint[]; compact?: boolean }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  /* Past about ten bars the value labels collide, so they step back to the ends only. */
  const labelEvery = points.length > 10 ? Math.ceil(points.length / 5) : 1;
  return (
    <View style={s.bars}>
      {points.map((p, i) => {
        const h = Math.max(2, Math.round((p.value / max) * BAR_HEIGHT));
        const on = p.current ?? false;
        const showValue = !compact && (i % labelEvery === 0 || i === points.length - 1);
        return (
          <View key={`${p.label}-${i}`} style={s.barCol} accessibilityLabel={`${p.label}: ${euro(p.value)}`}>
            <View style={s.barValue}>{showValue ? <Micro style={s.barValueText} numberOfLines={1}>{shortEuro(p.value)}</Micro> : null}</View>
            <View style={[s.barTrack, { height: BAR_HEIGHT }]}>
              <View style={[s.bar, { height: h, backgroundColor: on ? cosmos.color.ink : cosmos.color.ruleStrong }]} />
            </View>
            <Micro style={[s.barLabel, on && s.barLabelOn]} numberOfLines={1}>{p.label}</Micro>
          </View>
        );
      })}
    </View>
  );
}

/** 1.234 EUR becomes 1,2k over a bar, where the full amount would not fit. */
function shortEuro(v: number): string {
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')}k`;
  return euro(v).replace(/\s?\u20AC$/, '');
}

/* ----------------------------------------------------------------------------------------
 * Shares. Horizontal, label left, amount right, the bar underneath as long as its share.
 * -------------------------------------------------------------------------------------- */

export function Shares({ items }: { items: FigureShare[] }) {
  const top = Math.max(...items.map((i) => i.share), 0.0001);
  return (
    <View style={s.shares}>
      {items.map((it, i) => (
        <View key={`${it.label}-${i}`} style={s.shareRow} accessibilityLabel={`${it.label}: ${euro(it.value)}, ${Math.round(it.share * 100)} percent`}>
          <View style={s.shareLine}>
            <Body numberOfLines={1} style={s.shareLabel}>{it.label}</Body>
            <Body tabular>{euro(it.value)}</Body>
          </View>
          <View style={s.shareTrack}>
            <View style={[s.shareBar, { width: `${Math.max(1, Math.round((it.share / top) * 100))}%` }]} />
          </View>
          <Micro>{Math.round(it.share * 100)}%</Micro>
        </View>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------------------------------------
 * Figure. One switch from the wire shape to the drawing, with its title over it.
 * -------------------------------------------------------------------------------------- */

export function Figure({ figure }: { figure: ChatFigure }) {
  const title = figure.title;
  let body: React.ReactNode = null;
  switch (figure.kind) {
    case 'week':
      /* Seven days, today in ink. The same bars as the months, with the day letter under them. */
      body = figure.days.length ? <Bars points={figure.days.map((d) => ({ label: d.label, value: d.value, current: d.today }))} /> : null;
      break;
    case 'ahead':
      body = figure.items.length ? (
        <View>
          <Hairline />
          {figure.items.map((it, i) => (
            <View key={`${it.label}-${i}`}>
              <Row lead={it.day} label={it.label} sub={it.basis || undefined} trail={euro(it.amount)} />
              <Hairline />
            </View>
          ))}
        </View>
      ) : null;
      break;
    case 'months':
    case 'weekdays':
      body = figure.points.length ? <Bars points={figure.points} /> : null;
      break;
    case 'history':
      body = figure.points.length ? <Bars points={figure.points} compact={figure.points.length > 8} /> : null;
      break;
    case 'shares':
      body = figure.items.length ? <Shares items={figure.items} /> : null;
      break;
    case 'recurring':
      body = figure.items.length ? (
        <View>
          <Hairline />
          {figure.items.map((it, i) => (
            <View key={`${it.label}-${i}`}>
              <Row
                label={it.label}
                sub={[it.cadence, it.next ? `next around ${dayMonth(it.next)}` : ''].filter(Boolean).join(', ')}
                trail={euro(it.amount)}
              />
              <Hairline />
            </View>
          ))}
        </View>
      ) : null;
      break;
    case 'band':
      body = <Band spent={figure.spent} likely={figure.likely} high={figure.high} />;
      break;
  }
  if (!body) return null;
  return (
    <View style={s.figure} accessibilityRole="image">
      {title ? <Micro>{title}</Micro> : null}
      {body}
    </View>
  );
}

/* ----------------------------------------------------------------------------------------
 * A place on a map. The only picture in the app, and it is the person's own neighbourhood:
 * the server draws it in the same greys as the rest of the page and hands it over behind
 * the session, so the Image carries the token rather than a public address.
 * -------------------------------------------------------------------------------------- */

export function HomeMap({ lat, lng, district, basis }: { lat: number; lng: number; district: string; basis?: string | null }) {
  const [source, setSource] = useState<ImageSource | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    moneyApi.homeMapSource(lat, lng, 14).then((src) => { if (live) setSource(src); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [lat, lng]);
  return (
    <View style={s.map} accessibilityLabel={`A map around ${district}`}>
      {/* No frame without a map in it: an empty grey block reads as something broken. */}
      {source && !failed ? (
        <View style={s.mapFrame}>
          <Image source={source} style={s.mapImage} resizeMode="cover" onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
        </View>
      ) : null}
      <View style={s.mapCaption}>
        <Body>{district}</Body>
        {basis ? <Small quiet>{basis}</Small> : null}
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------------------------------
 * Styles.
 * -------------------------------------------------------------------------------------- */

const s = StyleSheet.create({
  figure: { gap: cosmos.space.md, paddingVertical: cosmos.space.sm },

  band: { gap: cosmos.space.md },
  bandTrack: { height: 6, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.panelDeep },
  bandLikely: { position: 'absolute', top: 0, left: 0, height: 6, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.rule },
  bandSpent: { position: 'absolute', top: 0, left: 0, height: 6, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.ink },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  strip: { gap: 8 },
  stripDays: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: STRIP_HEIGHT, borderBottomWidth: 1, borderBottomColor: cosmos.color.rule },
  stripDay: { flex: 1, height: STRIP_HEIGHT, position: 'relative' },
  stripSaid: { position: 'absolute', left: 0, right: 0, backgroundColor: cosmos.color.rule },
  stripBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: cosmos.color.ink },
  stripBarToday: { backgroundColor: cosmos.color.ink3 },
  stripBarMiss: { backgroundColor: cosmos.color.ruleStrong },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: cosmos.space.xs },
  barCol: { flex: 1, alignItems: 'center', gap: cosmos.space.xs },
  barValue: { height: 14, justifyContent: 'flex-end' },
  barValueText: { color: cosmos.color.ink2 },
  barTrack: { width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 2 },
  barLabel: { marginTop: 2 },
  barLabelOn: { color: cosmos.color.ink },

  shares: { gap: cosmos.space.md },
  shareRow: { gap: cosmos.space.xs },
  shareLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: cosmos.space.md },
  shareLabel: { flex: 1 },
  shareTrack: { height: 4, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.panelDeep, overflow: 'hidden' },
  shareBar: { height: 4, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.ink },

  map: { gap: cosmos.space.sm, paddingVertical: cosmos.space.sm },
  mapFrame: {
    width: '100%', aspectRatio: 2, borderRadius: cosmos.radius.card, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: cosmos.color.rule, backgroundColor: cosmos.color.panel,
  },
  mapImage: { width: '100%', height: '100%' },
  mapCaption: { gap: 2 },
});
