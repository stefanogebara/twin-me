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
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { cosmos } from '../constants/cosmos';
import { ENTER_Y, PRESS_SCALE, COUNT_MS, fade, spring, staggerDelay, motionReduced } from './motion';

/* ----------------------------------------------------------------------------------------
 * Type. One ramp, six sizes, and the mono role for counters and provenance.
 * -------------------------------------------------------------------------------------- */

const ramp = StyleSheet.create({
  display: {
    fontFamily: cosmos.font.medium, fontSize: cosmos.size.display, lineHeight: 48,
    letterSpacing: cosmos.tracking.display, color: cosmos.color.ink,
  },
  title: {
    fontFamily: cosmos.font.medium, fontSize: cosmos.size.title, lineHeight: 31,
    letterSpacing: cosmos.tracking.title, color: cosmos.color.ink,
  },
  heading: {
    fontFamily: cosmos.font.medium, fontSize: cosmos.size.heading, lineHeight: 25,
    letterSpacing: cosmos.tracking.heading, color: cosmos.color.ink,
  },
  body: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.body, lineHeight: 23,
    letterSpacing: cosmos.tracking.body, color: cosmos.color.ink,
  },
  small: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, lineHeight: 20,
    letterSpacing: cosmos.tracking.body, color: cosmos.color.ink2,
  },
  micro: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.micro, lineHeight: 14,
    letterSpacing: cosmos.tracking.mono, textTransform: 'uppercase', color: cosmos.color.ink3,
  },
});

type T = TextProps & { muted?: boolean; quiet?: boolean; tabular?: boolean };
const tone = (p: T): TextStyle | undefined =>
  p.quiet ? { color: cosmos.color.ink3 } : p.muted ? { color: cosmos.color.ink2 } : undefined;
const digits = (p: T): TextStyle | undefined => (p.tabular ? { fontVariant: ['tabular-nums'] } : undefined);

export const Display = (p: T) => <Text {...p} style={[ramp.display, tone(p), digits(p), p.style]} />;
export const Title = (p: T) => <Text {...p} style={[ramp.title, tone(p), digits(p), p.style]} />;
export const Heading = (p: T) => <Text {...p} style={[ramp.heading, tone(p), digits(p), p.style]} />;
export const Body = (p: T) => <Text {...p} style={[ramp.body, tone(p), digits(p), p.style]} />;
export const Small = (p: T) => <Text {...p} style={[ramp.small, tone(p), digits(p), p.style]} />;
/** A counter, a date, a piece of provenance. Never a sentence. */
export const Micro = (p: T) => <Text {...p} style={[ramp.micro, digits({ ...p, tabular: true }), p.style]} />;

/* ----------------------------------------------------------------------------------------
 * Structure.
 * -------------------------------------------------------------------------------------- */

/** The only divider. One device pixel, never a shadow. */
export const Hairline = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: cosmos.color.rule }, style]} />
);

/** A page: paper, side padding, and the rhythm between sections. */
export const Page = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ flex: 1, backgroundColor: cosmos.color.canvas }, style]}>{children}</View>
);

/** A section: a hairline above, a heading, generous space, and its content. */
export function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Hairline />
      <View style={s.sectionHead}>
        <Heading>{title}</Heading>
        {aside ? <Micro>{aside}</Micro> : null}
      </View>
      {children}
    </View>
  );
}

/** A row in a list: date or label on the left in mono, the name, and a tabular amount. */
export function Row({ lead, label, sub, trail, quiet, onPress, disabled }: {
  lead?: string; label: string; sub?: string; trail?: string; quiet?: boolean; onPress?: () => void; disabled?: boolean;
}) {
  const inner = (
    <View style={s.row}>
      {lead ? <Micro style={s.rowLead}>{lead}</Micro> : null}
      <View style={s.rowMid}>
        <Body muted={quiet} numberOfLines={1}>{label}</Body>
        {sub ? <Small quiet>{sub}</Small> : null}
      </View>
      {trail ? <Body muted={quiet} tabular style={s.rowTrail}>{trail}</Body> : null}
    </View>
  );
  if (!onPress) return inner;
  return <Press onPress={onPress} disabled={disabled}>{inner}</Press>;
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

export function Enter({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = motionReduced();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const y = useSharedValue(reduced ? 0 : ENTER_Y);
  useEffect(() => {
    const t = setTimeout(() => { opacity.value = fade(1); y.value = spring(0); }, staggerDelay(index));
    return () => clearTimeout(t);
  }, [index, opacity, y]);
  const a = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
  return <Animated.View style={[a, style]}>{children}</Animated.View>;
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
  section: { gap: cosmos.space.md, paddingTop: cosmos.space.lg, marginTop: cosmos.space.lg },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: cosmos.space.md },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: cosmos.space.md, paddingVertical: 13 },
  rowLead: { width: 58 },
  rowMid: { flex: 1, gap: 2 },
  rowTrail: { textAlign: 'right' },
  pill: {
    alignSelf: 'flex-start', backgroundColor: cosmos.color.ink, borderRadius: cosmos.radius.pill,
    paddingVertical: 14, paddingHorizontal: 22, minHeight: 48, justifyContent: 'center',
  },
  pillGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: cosmos.color.ruleStrong },
  pillSmall: { paddingVertical: 9, paddingHorizontal: 14, minHeight: 36 },
  pillOff: { opacity: 0.45 },
  pillText: { fontFamily: cosmos.font.medium, fontSize: 15, letterSpacing: -0.1, color: cosmos.color.canvas },
  pillTextGhost: { color: cosmos.color.ink },
  pillTextSmall: { fontSize: 13 },
  card: {
    borderRadius: cosmos.radius.pill, borderWidth: 1, borderColor: cosmos.color.ruleStrong,
    paddingVertical: 12, paddingHorizontal: 18, backgroundColor: cosmos.color.canvas,
  },
  cardOn: { backgroundColor: cosmos.color.ink, borderColor: cosmos.color.ink },
  cardText: { fontFamily: cosmos.font.medium, fontSize: 15, letterSpacing: -0.1, color: cosmos.color.ink },
  cardTextOn: { color: cosmos.color.canvas },
});
