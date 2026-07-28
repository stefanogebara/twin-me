import React, { useEffect, useRef, useState } from 'react';
import { useSun } from '@/contexts/SunContext';
import { type SunPhase } from '@/hooks/useSunPosition';
import { BG_MAP, overlayRgba, type BgConfig } from './dayNightBackground.config';

export const DayNightBackground: React.FC = () => {
  const { sunPhase } = useSun();

  const [currentBg, setCurrentBg] = useState<BgConfig>(() => BG_MAP[sunPhase]);
  const [prevBg, setPrevBg] = useState<BgConfig | null>(null);
  const [prevVisible, setPrevVisible] = useState(false);
  const [currentVisible, setCurrentVisible] = useState(true);

  const prevPhaseRef = useRef<SunPhase>(sunPhase);

  useEffect(() => {
    if (sunPhase === prevPhaseRef.current) return;
    prevPhaseRef.current = sunPhase;

    const newBg = BG_MAP[sunPhase];

    // Stash the current bg as the "prev" layer — shown at full opacity
    setPrevBg(currentBg);
    setPrevVisible(true);

    // Load new bg but start invisible
    setCurrentBg(newBg);
    setCurrentVisible(false);

    // Two RAF ticks: let both elements render before starting transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPrevVisible(false);    // prev fades out
        setCurrentVisible(true);  // new fades in
      });
    });

    // Remove prev layer after crossfade completes
    const cleanup = setTimeout(() => {
      setPrevBg(null);
      setPrevVisible(false);
    }, 2600);

    return () => clearTimeout(cleanup);
  }, [sunPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        backgroundColor: '#13121a',
        overflow: 'hidden',
      }}
    >
      {/* Outgoing layer — fades out */}
      {prevBg && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${prevBg.src})`,
            backgroundSize: 'cover',
            backgroundPosition: prevBg.position ?? 'top center',
            opacity: prevVisible ? 1 : 0,
            transition: 'opacity 2.2s ease-in-out',
            willChange: 'opacity',
          }}
        />
      )}

      {/* Incoming layer — fades in */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${currentBg.src})`,
          backgroundSize: 'cover',
          backgroundPosition: currentBg.position ?? 'top center',
          opacity: currentVisible ? 1 : 0,
          transition: 'opacity 2.2s ease-in-out',
          willChange: 'opacity',
        }}
      />

      {/* Readability veil — per-phase colour + opacity. Warm copper over the
          blue midday photos (morning/noon/afternoon) so they read amber/charcoal
          instead of navy and keep muted text legible; neutral black elsewhere. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: overlayRgba(currentBg),
          transition: 'background-color 2.2s ease-in-out',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
