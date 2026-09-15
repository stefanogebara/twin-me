/**
 * The carved marks on the phone: the same relief woodcuts the web carries (public/images/
 * money/carved), bundled here because a native app cannot load them from the site. Each is
 * an alpha mask, ink on nothing; the tile's ground is the kind's signature at low strength.
 * React Native needs a static require per file, so the map is written out.
 */
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import barPng from '../../assets/carved/bar.png';
import cashPng from '../../assets/carved/cash.png';
import coffeePng from '../../assets/carved/coffee.png';
import diaryPng from '../../assets/carved/diary.png';
import eating_outPng from '../../assets/carved/eating_out.png';
import entertainmentPng from '../../assets/carved/entertainment.png';
import groceriesPng from '../../assets/carved/groceries.png';
import keepPng from '../../assets/carved/keep.png';
import pharmacyPng from '../../assets/carved/pharmacy.png';
import rentPng from '../../assets/carved/rent.png';
import softwarePng from '../../assets/carved/software.png';
import sportPng from '../../assets/carved/sport.png';
import taxiPng from '../../assets/carved/taxi.png';
import transferPng from '../../assets/carved/transfer.png';
import transportPng from '../../assets/carved/transport.png';

const MARKS = {
  bar: barPng,
  cash: cashPng,
  coffee: coffeePng,
  diary: diaryPng,
  eating_out: eating_outPng,
  entertainment: entertainmentPng,
  groceries: groceriesPng,
  keep: keepPng,
  pharmacy: pharmacyPng,
  rent: rentPng,
  software: softwarePng,
  sport: sportPng,
  taxi: taxiPng,
  transfer: transferPng,
  transport: transportPng,
} as const;
type MarkName = keyof typeof MARKS;

/** Which mark a kind of place or a fact takes; a kind with no mark gets no picture. */
const MARK_BY_KIND: Record<string, MarkName> = {
  groceries: 'groceries', 'eating out': 'eating_out', coffee: 'coffee', transport: 'transport', taxi: 'taxi', fuel: 'transport',
  rent: 'rent', home: 'rent', software: 'software', electronics: 'software', education: 'software',
  sport: 'sport', health: 'pharmacy', pharmacy: 'pharmacy', cash: 'cash', fees: 'cash', bills: 'cash',
  transfers: 'transfer', entertainment: 'entertainment', bar: 'bar', travel: 'transport', lodging: 'rent',
  keep: 'keep', diary: 'diary', income: 'cash', person: 'transfer', commitment: 'rent', cap: 'eating_out', split: 'transfer', note: 'diary', calendar: 'diary',
};
/** The ground a kind takes: its signature at 14 percent; the panel tone where none fits. */
const GROUND_BY_KIND: Record<string, string> = {
  'eating out': 'rgba(196,120,51,0.14)', coffee: 'rgba(196,120,51,0.14)', entertainment: 'rgba(196,120,51,0.14)', bar: 'rgba(196,120,51,0.14)', cap: 'rgba(196,120,51,0.14)', keep: 'rgba(196,120,51,0.14)',
  groceries: 'rgba(76,151,134,0.14)', health: 'rgba(76,151,134,0.14)', pharmacy: 'rgba(76,151,134,0.14)', sport: 'rgba(76,151,134,0.14)',
  transport: 'rgba(102,140,194,0.14)', taxi: 'rgba(102,140,194,0.14)', travel: 'rgba(102,140,194,0.14)', fuel: 'rgba(102,140,194,0.14)', diary: 'rgba(102,140,194,0.14)', calendar: 'rgba(102,140,194,0.14)',
  software: 'rgba(129,121,251,0.14)', electronics: 'rgba(129,121,251,0.14)', education: 'rgba(129,121,251,0.14)', note: 'rgba(129,121,251,0.14)',
  transfers: 'rgba(186,112,182,0.14)', person: 'rgba(186,112,182,0.14)', rent: 'rgba(186,112,182,0.14)', home: 'rgba(186,112,182,0.14)', lodging: 'rgba(186,112,182,0.14)', commitment: 'rgba(186,112,182,0.14)', split: 'rgba(186,112,182,0.14)', income: 'rgba(186,112,182,0.14)',
};

export function markFor(kind: string | null | undefined): MarkName | null {
  return kind ? MARK_BY_KIND[kind] || null : null;
}

/** A 28px tile with the kind's mark in ink on its ground; nothing when the kind has no mark. */
export function KindTile({ kind }: { kind: string | null | undefined }) {
  const mark = markFor(kind);
  if (!mark) return null;
  return (
    <View style={[s.tile, { backgroundColor: (kind && GROUND_BY_KIND[kind]) || '#f6f5f3' }]}>
      <Image source={MARKS[mark]} style={s.mark} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

/** The page's stamp: one carving at the head of a page, still, never tied to the numbers. */
export function Stamp({ mark, size = 56 }: { mark: MarkName; size?: number }) {
  return <Image source={MARKS[mark]} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

const s = StyleSheet.create({
  tile: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 22, height: 22 },
});
