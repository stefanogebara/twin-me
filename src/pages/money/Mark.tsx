/**
 * Brand marks, the one place the register allows a company's shape: a 32px tile with the
 * mark in ink and the name as text beside it. Paths are from simple-icons (CC0), inlined
 * because SVG attributes do not read CSS variables and nothing here may load from a CDN.
 * Santander and Blackboard are not in that library (their marks are trademark-guarded), so
 * their tiles keep the generic glyph until an official asset comes from the brand's kit.
 * Never a redrawn logo.
 */
import React from 'react';
import { PATHS } from './markPaths';

/** The mark alone, 16px, in the current text colour. Decorative: the name sits beside it. */
export default function Mark({ name, size = 16 }: { name: string; size?: number }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
