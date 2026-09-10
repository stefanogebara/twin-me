/**
 * The marks that stand in front of a source.
 * ==========================================
 * Instinct's rows begin with a brand logo. Ours begin with a drawing, because our sources
 * are a bank, a handset and a diary rather than three companies, and a page of real logos
 * would put three different colour palettes on a screen that has none.
 *
 * What matters is that they share an optical square and a stroke, so a column of them reads
 * as one column. Each is 26 points inside a 28 point box, drawn at 1.4 points in the ink.
 * They are built from Views on purpose: no SVG library is installed, and three rectangles
 * do not justify adding one.
 */

import { StyleSheet, View } from 'react-native';
import { cosmos } from '../constants/cosmos';

const STROKE = 1.4;
const BOX = 26;

/** A bank: a card with its magnetic stripe. */
export const CardGlyph = () => (
  <View style={g.box}>
    <View style={[g.frame, { top: 5, height: 16, left: 0, right: 0 }]} />
    <View style={[g.line, { top: 10, left: 0, right: 0 }]} />
  </View>
);

/** A handset: the thing that sees a payment as it happens. */
export const PhoneGlyph = () => (
  <View style={g.box}>
    <View style={[g.frame, { top: 1, bottom: 1, left: 7, right: 7, borderRadius: 4 }]} />
    <View style={[g.line, { bottom: 4, left: 11, right: 11 }]} />
  </View>
);

/** A diary: the week that costs something. */
export const CalendarGlyph = () => (
  <View style={g.box}>
    <View style={[g.frame, { top: 3, bottom: 1, left: 2, right: 2, borderRadius: 4 }]} />
    <View style={[g.line, { top: 9, left: 2, right: 2 }]} />
    <View style={[g.tick, { left: 8 }]} />
    <View style={[g.tick, { right: 8 }]} />
  </View>
);

/** A charge that comes back: a circle, closed. */
export const RepeatGlyph = () => (
  <View style={g.box}>
    <View style={[g.frame, { top: 3, bottom: 3, left: 3, right: 3, borderRadius: 10 }]} />
    <View style={[g.line, { top: 12, left: 8, right: 8 }]} />
  </View>
);

const g = StyleSheet.create({
  box: { width: BOX, height: BOX },
  frame: { position: 'absolute', borderWidth: STROKE, borderColor: cosmos.color.ink, borderRadius: 3 },
  line: { position: 'absolute', height: STROKE, backgroundColor: cosmos.color.ink, borderRadius: 1 },
  tick: { position: 'absolute', top: 0, width: STROKE, height: 5, backgroundColor: cosmos.color.ink, borderRadius: 1 },
});
