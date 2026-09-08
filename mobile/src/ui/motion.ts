/**
 * Motion, and nothing but the one family of it.
 * ==============================================
 * Slop is what a screen looks like when every element moves on its own curve. This file
 * holds the only two curves the app is allowed: one spring for anything that moves or
 * scales, one short ease-out for anything that fades. A transition built from these two
 * cannot fight itself, and two transitions built from them cannot fight each other.
 *
 * Everything collapses to a step when the person has asked their phone for less motion.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, withSpring, withTiming, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

/** Position and scale. Settles in roughly 400 ms without a visible overshoot. */
export const SPRING: WithSpringConfig = { damping: 26, stiffness: 240, mass: 1 };

/** Opacity. Short, because a fade that is noticed is a fade that is too long. */
export const FADE: WithTimingConfig = { duration: 180, easing: Easing.out(Easing.cubic) };

/** A number that changes in front of the person counts between its values over this long. */
export const COUNT_MS = 320;

/** List items enter this far apart, and no more than STAGGER_CAP of them do so. */
export const STAGGER_MS = 24;
export const STAGGER_CAP = 6;

/** How far an entering element travels. Eight points: present, not theatrical. */
export const ENTER_Y = 8;

/** Pressed scale. Enough to feel, not enough to see the text reflow. */
export const PRESS_SCALE = 0.97;

let reducedMotion = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => { reducedMotion = v; }).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { reducedMotion = v; });

/** The current preference, for worklets and one-off reads. */
export function motionReduced(): boolean { return reducedMotion; }

/** The current preference, as state, for components that should re-render on change. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    return () => sub.remove();
  }, []);
  return reduced;
}

/** Move to a value on the spring, or arrive at once when motion is reduced. */
export function spring(to: number) {
  return reducedMotion ? withTiming(to, { duration: 0 }) : withSpring(to, SPRING);
}

/** Fade to a value, or arrive at once when motion is reduced. */
export function fade(to: number) {
  return reducedMotion ? withTiming(to, { duration: 0 }) : withTiming(to, FADE);
}

/** The delay for the n-th item of a list that enters together. */
export function staggerDelay(index: number): number {
  return reducedMotion ? 0 : Math.min(index, STAGGER_CAP) * STAGGER_MS;
}
