import React, { useEffect, useRef, useState } from 'react';
import { useSun } from '@/contexts/SunContext';
import { type SunPhase } from '@/hooks/useSunPosition';

interface BgConfig {
  src: string;
  overlayOpacity: number;
  position?: string;
}

const BG_MAP: Record<SunPhase, BgConfig> = {
  night:     { src: '/backgrounds/bg-night.jpg',        overlayOpacity: 0.12, position: 'top center' },
  dawn:      { src: '/backgrounds/bg-dawn.jpg',         overlayOpacity: 0.18, position: 'center' },
  sunrise:   { src: '/backgrounds/bg-sunrise.jpg',      overlayOpacity: 0.28, position: 'top left' },
  morning:   { src: '/backgrounds/bg-morning.jpg',      overlayOpacity: 0.45, position: 'top center' },
  noon:      { src: '/backgrounds/bg-noon.jpg',         overlayOpacity: 0.42, position: 'bottom center' },
  afternoon: { src: '/backgrounds/bg-noon.jpg',         overlayOpacity: 0.38, position: 'bottom center' },
  sunset:    { src: '/backgrounds/bg-sunset.jpg',       overlayOpacity: 0.22, position: 'center' },
  dusk:      { src: '/backgrounds/bg-dusk.jpg',         overlayOpacity: 0.15, position: 'bottom center' },
};

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

      {/* Readability overlay — adjusts per image brightness */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: `rgba(0,0,0,${currentBg.overlayOpacity})`,
          transition: 'background-color 2.2s ease-in-out',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
