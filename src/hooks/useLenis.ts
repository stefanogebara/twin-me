/**
 * useLenis — Opt-in smooth scroll via Lenis
 * ==========================================
 * Import and call in any page component to enable buttery smooth scrolling.
 * Automatically cleans up on unmount. Only runs on pages that explicitly opt in.
 *
 * Usage:
 *   import { useLenis } from '@/hooks/useLenis';
 *   const MyPage = () => { useLenis(); return <div>...</div>; };
 */

import { useEffect, useRef } from 'react';
import Lenis from 'lenis';

interface LenisOptions {
  /** Scroll speed multiplier (default: 1.1) */
  lerp?: number;
  /** Duration of the scroll animation (default: 1.2) */
  duration?: number;
  /** Smooth wheel scrolling (default: true) */
  smoothWheel?: boolean;
}

export function useLenis(options: LenisOptions = {}) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      lerp: options.lerp ?? 0.1,
      duration: options.duration ?? 1.2,
      smoothWheel: options.smoothWheel ?? true,
    });

    lenisRef.current = lenis;

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    const frameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [options.lerp, options.duration, options.smoothWheel]);

  return lenisRef;
}
