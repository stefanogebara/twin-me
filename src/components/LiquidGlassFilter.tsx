import React from 'react';

/**
 * Claura liquid-glass lens filter (#liquid) — smooth EDGE refraction:
 * a 2D displacement map built from feImage gradients keeps the panel
 * center calm while the outer ~30% rim bends the backdrop outward.
 * Mounted once in the app shell; surfaces opt in via
 * `.claura-glass--refract` (HIG: use lensing sparingly — hero panels only).
 * Chromium-only; other engines keep the blur/saturate fallback.
 */
const DISPLACEMENT_MAP =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><defs><linearGradient id='x' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='rgb(255,0,0)'/><stop offset='0.3' stop-color='rgb(128,0,0)'/><stop offset='0.7' stop-color='rgb(128,0,0)'/><stop offset='1' stop-color='rgb(0,0,0)'/></linearGradient><linearGradient id='y' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='rgb(0,255,0)'/><stop offset='0.3' stop-color='rgb(0,128,0)'/><stop offset='0.7' stop-color='rgb(0,128,0)'/><stop offset='1' stop-color='rgb(0,0,0)'/></linearGradient></defs><rect width='400' height='400' fill='url(%23x)'/><rect width='400' height='400' fill='url(%23y)' style='mix-blend-mode:screen'/></svg>";

export const LiquidGlassFilter: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <filter
      id="liquid"
      x="-5%"
      y="-5%"
      width="110%"
      height="110%"
      colorInterpolationFilters="sRGB"
      primitiveUnits="objectBoundingBox"
    >
      <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" href={DISPLACEMENT_MAP} />
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.003" result="b" />
      <feDisplacementMap in="b" in2="map" scale="0.06" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);
