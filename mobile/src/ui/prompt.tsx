/**
 * The prompt and the thinking line.
 * =================================
 * Two parts a conversation needs that the page primitives do not have.
 *
 * Prompt: one capsule holding the field and the black circular send, the way the best chat
 * inputs are built: nothing sits outside the pill. While the ledger is working the whole
 * capsule recedes (a little smaller, a little further away, a little quieter) and comes back
 * when the answer lands, so the eye is handed from the box to the transcript and back.
 *
 * Shimmer: a sentence with a band of light moving through its letters, for as long as something
 * is being read. It is the one motion in the app allowed to repeat, because waiting is the one
 * state with no end the app can animate towards. It stops the moment the sentence is replaced.
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { cosmos } from '../constants/cosmos';
import { motionReduced, spring } from './motion';
import { Press } from './primitives';

/* ----------------------------------------------------------------------------------------
 * Prompt.
 * -------------------------------------------------------------------------------------- */

export function Prompt({ value, onChange, onSubmit, placeholder, busy, disabled, autoFocus, onFocus, style }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  /** The ledger is working on the last line: the capsule recedes and will not send. */
  busy?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onFocus?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const away = useSharedValue(0);
  useEffect(() => { away.value = busy ? spring(1) : spring(0); }, [busy, away]);
  const recede = useAnimatedStyle(() => ({
    opacity: 1 - away.value * 0.55,
    /* No perspective here on purpose: a rotateX with perspective on this view made the
       ScrollView beside it disappear on iOS while it was applied. Scale and a small drop read
       as distance well enough. */
    transform: [{ translateY: away.value * 4 }, { scale: 1 - away.value * 0.04 }],
  }));
  const canSend = !busy && !disabled && value.trim().length > 0;
  return (
    <Animated.View style={[p.capsule, recede, style]}>
      <TextInput
        style={p.field}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={cosmos.color.ink3}
        returnKeyType="send"
        submitBehavior="submit"
        onSubmitEditing={onSubmit}
        onFocus={onFocus}
        editable={!busy && !disabled}
        autoFocus={autoFocus}
        autoCorrect
        multiline={false}
        accessibilityLabel={placeholder}
      />
      <Press
        onPress={onSubmit}
        disabled={!canSend}
        accessibilityLabel="Send"
        style={[p.send, !canSend && p.sendOff]}
      >
        <Text style={p.arrow}>{'\u2191'}</Text>
      </Press>
    </Animated.View>
  );
}

/* ----------------------------------------------------------------------------------------
 * Shimmer.
 * -------------------------------------------------------------------------------------- */

const SWEEP_MS = 1400;
/** How many letters wide the band of light is. */
const BAND = 7;

export function Shimmer({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (motionReduced()) { t.value = 0; return; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.sin) }), -1, false);
    return () => cancelAnimation(t);
  }, [t, text]);
  const chars = useMemo(() => Array.from(text), [text]);
  return (
    <View style={p.shimmerRow} accessibilityRole="text" accessibilityLabel={text}>
      {chars.map((c, i) => <Letter key={`${i}-${c}`} c={c} i={i} n={chars.length} t={t} style={style} />)}
    </View>
  );
}

function Letter({ c, i, n, t, style }: { c: string; i: number; n: number; t: SharedValue<number>; style?: StyleProp<TextStyle> }) {
  const a = useAnimatedStyle(() => {
    /* The band starts before the first letter and leaves after the last, so every letter gets
       the same pass, and the ends of the sentence do not flicker. */
    const centre = interpolate(t.value, [0, 1], [-BAND, n + BAND]);
    const d = Math.abs(i - centre);
    const lit = d >= BAND ? 0 : 1 - d / BAND;
    return { opacity: 0.38 + 0.62 * lit * lit };
  });
  return <Animated.Text style={[p.letter, style, a]}>{c === ' ' ? ' ' : c}</Animated.Text>;
}

/* ----------------------------------------------------------------------------------------
 * Styles.
 * -------------------------------------------------------------------------------------- */

const p = StyleSheet.create({
  capsule: {
    flexDirection: 'row', alignItems: 'center', gap: cosmos.space.sm,
    minHeight: 56, borderRadius: cosmos.radius.pill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: cosmos.color.ruleStrong,
    backgroundColor: cosmos.color.canvas,
    paddingLeft: cosmos.space.md + 4, paddingRight: 6, paddingVertical: 6,
  },
  field: {
    flex: 1, minHeight: 44, paddingVertical: 10,
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.body, letterSpacing: cosmos.tracking.body,
    color: cosmos.color.ink,
  },
  send: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: cosmos.color.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  sendOff: { backgroundColor: cosmos.color.ruleStrong },
  arrow: { fontFamily: cosmos.font.medium, fontSize: 20, lineHeight: 24, color: cosmos.color.canvas },
  shimmerRow: { flexDirection: 'row', flexWrap: 'wrap' },
  letter: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, lineHeight: 20,
    letterSpacing: cosmos.tracking.body, color: cosmos.color.ink,
  },
});
