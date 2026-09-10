/**
 * The parts every screen is built from, and the only parts.
 * =========================================================
 * A screen in this app is text on paper with hairlines between things and one black pill
 * for the thing worth pressing. These primitives are that vocabulary written once, so the
 * type ramp, the tracking, the radii and the motion cannot drift from screen to screen.
 * Every visual decision a screen might want to make on its own is made here instead.
 *
 * No gradients. No shadows. No blur. Where a component here is tempted by one of those it
 * is because the layout underneath is wrong, and the layout is what gets fixed.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { LinearTransition, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { cosmos } from '../constants/cosmos';
import { ENTER_Y, PRESS_SCALE, COUNT_MS, FADE, fade, spring, staggerDelay, motionReduced } from './motion';

/* ----------------------------------------------------------------------------------------
 * Type. One ramp. Figures are set at weight 400, because a number is large enough to carry
 * itself; only a label or a row's title is set at 500, and 500 is the ceiling.
 *
 * There is no uppercase role. Instinct has none, and a tracked capital label is the single
 * loudest thing a quiet screen can contain; the small sizes are sentence case, which is why
 * `Micro` is now fine print rather than a caption in capitals.
 * -------------------------------------------------------------------------------------- */

const ramp = StyleSheet.create({
  display: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.display, lineHeight: cosmos.line.display,
    letterSpacing: cosmos.tracking.display, color: cosmos.color.ink,
  },
  title: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.title, lineHeight: cosmos.line.title,
    letterSpacing: cosmos.tracking.title, color: cosmos.color.ink,
  },
  heading: {
    fontFamily: cosmos.font.medium, fontSize: cosmos.size.heading, lineHeight: cosmos.line.heading,
    letterSpacing: cosmos.tracking.heading, color: cosmos.color.ink,
  },
  label: {
    fontFamily: cosmos.font.medium, fontSize: cosmos.size.label, lineHeight: cosmos.line.label,
    letterSpacing: cosmos.tracking.label, color: cosmos.color.ink,
  },
  body: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.body, lineHeight: cosmos.line.body,
    letterSpacing: cosmos.tracking.body, color: cosmos.color.ink,
  },
  small: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, lineHeight: cosmos.line.small,
    letterSpacing: cosmos.tracking.small, color: cosmos.color.ink2,
  },
  micro: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.micro, lineHeight: cosmos.line.micro,
    letterSpacing: cosmos.tracking.micro, color: cosmos.color.ink2,
  },
});

type T = TextProps & { muted?: boolean; quiet?: boolean; tabular?: boolean };
const tone = (p: T): TextStyle | undefined =>
  p.quiet ? { color: cosmos.color.ink3 } : p.muted ? { color: cosmos.color.ink2 } : undefined;
const digits = (p: T): TextStyle | undefined => (p.tabular ? { fontVariant: ['tabular-nums'] } : undefined);

export const Display = (p: T) => <Text {...p} style={[ramp.display, tone(p), digits(p), p.style]} />;
export const Title = (p: T) => <Text {...p} style={[ramp.title, tone(p), digits(p), p.style]} />;
export const Heading = (p: T) => <Text {...p} style={[ramp.heading, tone(p), digits(p), p.style]} />;
/** The name of a section, or the title of a row. Sentence case, weight 500, ink. */
export const Label = (p: T) => <Text {...p} style={[ramp.label, tone(p), digits(p), p.style]} />;
export const Body = (p: T) => <Text {...p} style={[ramp.body, tone(p), digits(p), p.style]} />;
export const Small = (p: T) => <Text {...p} style={[ramp.small, tone(p), digits(p), p.style]} />;
/** Fine print: a date, a count, a piece of provenance. Sentence case, and set back. */
export const Micro = (p: T) => <Text {...p} style={[ramp.micro, tone(p), digits(p), p.style]} />;

/* ----------------------------------------------------------------------------------------
 * Structure.
 * -------------------------------------------------------------------------------------- */

/** The only divider. One device pixel, never a shadow. */
export const Hairline = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: cosmos.color.rule }, style]} />
);

/** A page: white, and the rhythm between sections. */
export const Page = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ flex: 1, backgroundColor: cosmos.color.canvas }, style]}>{children}</View>
);

/**
 * A section: its name, then its content. Sections are told apart by the space above them,
 * not by a rule across the page, which is how their pages read as calm rather than ruled.
 */
export function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Label>{title}</Label>
        {aside ? <Micro quiet>{aside}</Micro> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * A panel: white, a hairline around it, and hairlines between the rows inside it. This is
 * the only box in the app. Anything that is a list of related things goes in one.
 */
export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.panel, style]}>
      <List>{children}</List>
    </View>
  );
}

/**
 * A list: rows against the page, parted by hairlines and nothing else. A list is not a
 * panel: ninety ledger rows in a box would be a box, so the long ones are bare and only a
 * short set of related things earns a border around it.
 */
export function List({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={style}>
      {rows.map((child, i) => (
        <View key={i}>
          {i > 0 ? <Hairline /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * A row. Two shapes, one component.
 *
 * A thing you can open is a glyph, a title, one line saying what it is, and a chevron. It
 * never carries a button: on a 390 point screen a button on the right takes the width the
 * sentence needs, and the sentence is what the person is reading. That is the single change
 * that stopped every description in this app from ending in an ellipsis.
 *
 * A thing you are just reading is a date, a name and an amount.
 */
export function Row({ lead, glyph, label, sub, trail, quiet, onPress, disabled, inset }: {
  lead?: string;
  glyph?: React.ReactNode;
  label: string;
  sub?: string;
  trail?: string;
  quiet?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Inside a panel the row carries the panel's air; on open page it carries its own. */
  inset?: boolean;
}) {
  const titled = Boolean(sub || glyph);
  const inner = (
    <View style={[s.row, inset && s.rowInset, titled && s.rowTitled]}>
      {lead ? <Micro quiet tabular style={s.rowLead}>{lead}</Micro> : null}
      {glyph ? <View style={s.rowGlyph}>{glyph}</View> : null}
      <View style={s.rowMid}>
        {titled
          ? <Label numberOfLines={1}>{label}</Label>
          : <Body muted={quiet} numberOfLines={1} style={s.rowName}>{label}</Body>}
        {sub ? <Micro numberOfLines={1}>{sub}</Micro> : null}
      </View>
      {trail ? <Body muted={quiet} tabular numberOfLines={1} style={s.rowTrail}>{trail}</Body> : null}
      {!trail && onPress ? <Chevron /> : null}
    </View>
  );
  if (!onPress) return inner;
  return <Press onPress={onPress} disabled={disabled}>{inner}</Press>;
}

/** The one affordance that says a row opens something. Drawn, so it needs no icon font. */
export function Chevron() {
  return (
    <View style={s.chevron}>
      <View style={s.chevronTop} />
      <View style={s.chevronBottom} />
    </View>
  );
}

/* ----------------------------------------------------------------------------------------
 * Glass. The one material besides paper: for chrome that floats over content, the way the
 * system's own bars do. A blur of what is beneath, a wash of paper over it, a bright hairline
 * along the edge. Never for content, never for a card; only for the capsule and the door.
 * -------------------------------------------------------------------------------------- */

export function Glass({ children, style, radius = cosmos.radius.pill }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number }) {
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: cosmos.glass.fill, borderRadius: radius }]} />
      {/* One hairline, the same one every other edge in the app uses. On a white page a
          second brighter ring has nothing to catch, and reads as a seam. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: cosmos.glass.edge }]} />
      {children}
    </View>
  );
}

/* ----------------------------------------------------------------------------------------
 * Press. Scale on the spring, no opacity change, so the label never dims into the paper.
 * -------------------------------------------------------------------------------------- */

export function Press({ children, style, onPress, disabled, ...rest }: PressableProps & { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => { scale.value = spring(PRESS_SCALE); }}
      onPressOut={() => { scale.value = spring(1); }}
      accessibilityRole="button"
      {...rest}
    >
      <Animated.View style={[a, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/** The one thing worth pressing on a screen is black. Everything else is a ghost. */
export function Pill({ label, onPress, ghost, small, disabled }: {
  label: string; onPress?: () => void; ghost?: boolean; small?: boolean; disabled?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      /* A small pill looks small and is hit like a large one: the target is 44 points even
         where the ink is 36, so nothing in the app is harder to press than it looks. */
      hitSlop={small ? { top: 4, bottom: 4, left: 4, right: 4 } : undefined}
      style={[s.pill, ghost && s.pillGhost, small && s.pillSmall, disabled && s.pillOff]}
    >
      <Text style={[s.pillText, ghost && s.pillTextGhost, small && s.pillTextSmall]}>{label}</Text>
    </Press>
  );
}

/** A selectable word. Pressed state is ink, not a tint. */
export function Card({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Press onPress={onPress} style={[s.card, selected && s.cardOn]}>
      <Text style={[s.cardText, selected && s.cardTextOn]}>{label}</Text>
    </Press>
  );
}

/* ----------------------------------------------------------------------------------------
 * Enter. The one way anything appears: a fade and eight points of rise, on the two curves.
 * -------------------------------------------------------------------------------------- */

export function Enter({ index = 0, settle, children, style }: { index?: number; settle?: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = motionReduced();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const y = useSharedValue(reduced ? 0 : ENTER_Y);
  useEffect(() => {
    const t = setTimeout(() => { opacity.value = fade(1); y.value = spring(0); }, staggerDelay(index));
    return () => clearTimeout(t);
  }, [index, opacity, y]);
  const a = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
  /* `settle`: when a sibling arrives or leaves, this one slides to its new place over the fade
     instead of jumping there in one frame. For lists that grow while they are read. */
  const layout = settle && !reduced ? LinearTransition.duration(FADE.duration ?? 180) : undefined;
  return <Animated.View layout={layout} style={[a, style]}>{children}</Animated.View>;
}

/* ----------------------------------------------------------------------------------------
 * A number that changes in front of the person counts between its values.
 * -------------------------------------------------------------------------------------- */

/* The count runs on the JS side on purpose: the formatter is an ordinary function (currency,
   locale, tabular digits), and an ordinary function called from a worklet on the UI thread is a
   crash, not a warning. Twenty re-renders of one Text over 320 ms cost nothing. */
export function Counting({ value, format, style }: { value: number; format: (n: number) => string; style?: StyleProp<TextStyle> }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; from.current = value; return; }
    if (motionReduced()) { from.current = value; setShown(value); return; }
    const start = from.current;
    const t0 = Date.now();
    let frame = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / COUNT_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = start + (value - start) * eased;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <Text style={[ramp.display, { fontVariant: ['tabular-nums'] }, style]}>{format(shown)}</Text>;
}

/* ----------------------------------------------------------------------------------------
 * Styles.
 * -------------------------------------------------------------------------------------- */

const s = StyleSheet.create({
  section: { gap: cosmos.space.md, marginTop: cosmos.space.xxl },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },

  panel: {
    borderWidth: 1, borderColor: cosmos.color.rule, borderRadius: cosmos.radius.card,
    backgroundColor: cosmos.color.white, overflow: 'hidden',
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: cosmos.space.md, paddingVertical: 12, minHeight: 48 },
  /* A row inside a panel wears the panel's air; on the open page it wears its own. */
  rowInset: { paddingHorizontal: cosmos.space.md },
  /* A titled row stacks two lines, so it is measured from the top rather than the middle. */
  rowTitled: { alignItems: 'center' },
  rowLead: { width: 52 },
  rowGlyph: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  rowMid: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { fontSize: cosmos.size.label, lineHeight: cosmos.line.label },
  rowTrail: { textAlign: 'right', fontSize: cosmos.size.label, lineHeight: cosmos.line.label },

  chevron: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  chevronTop: {
    position: 'absolute', width: 8, height: 1.4, borderRadius: 1, backgroundColor: cosmos.color.ink3,
    transform: [{ translateY: -2.4 }, { rotate: '45deg' }],
  },
  chevronBottom: {
    position: 'absolute', width: 8, height: 1.4, borderRadius: 1, backgroundColor: cosmos.color.ink3,
    transform: [{ translateY: 2.4 }, { rotate: '-45deg' }],
  },

  pill: {
    alignSelf: 'flex-start', backgroundColor: cosmos.color.ink, borderRadius: cosmos.radius.button,
    paddingVertical: 13, paddingHorizontal: 20, minHeight: 48, justifyContent: 'center',
  },
  pillGhost: { backgroundColor: cosmos.color.white, borderWidth: 1, borderColor: cosmos.color.rule },
  pillSmall: { paddingVertical: 9, paddingHorizontal: 14, minHeight: 36 },
  pillOff: { opacity: 0.45 },
  pillText: { fontFamily: cosmos.font.medium, fontSize: 15, lineHeight: 22, letterSpacing: cosmos.tracking.label, color: cosmos.color.white },
  pillTextGhost: { color: cosmos.color.ink },
  pillTextSmall: { fontSize: 14 },

  /* A word you can choose. Still a pill, because it is a word and not a button. */
  card: {
    borderRadius: cosmos.radius.pill, borderWidth: 1, borderColor: cosmos.color.rule,
    paddingVertical: 10, paddingHorizontal: 16, backgroundColor: cosmos.color.white,
  },
  cardOn: { backgroundColor: cosmos.color.ink, borderColor: cosmos.color.ink },
  cardText: { fontFamily: cosmos.font.medium, fontSize: 15, lineHeight: 22, letterSpacing: cosmos.tracking.label, color: cosmos.color.ink },
  cardTextOn: { color: cosmos.color.white },
});
