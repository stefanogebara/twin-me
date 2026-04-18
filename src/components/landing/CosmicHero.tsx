import { useRef, useMemo, useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

type CosmicHeroProps = {
  isSignedIn: boolean;
  isLoaded: boolean;
  onDashboard: () => void;
  onDiscover: () => void;
  onDemo: () => void;
};

/**
 * Cosmic scroll hero — 5 viewport-height stages, painterly/Ghibli aesthetic.
 * Background images cross-fade as user scrolls. Palette: indigo-black → pink-rose → amber.
 *
 * Stage 1: Origin     (aux-starry-clouds) — illustrated night sky + peach clouds
 * Stage 2: Variation  (01-space-earth)    — Ghibli clouds + stars
 * Stage 3: Arrival    (aux-pink-sky)      — pink anime clouds
 * Stage 4: Body       (04-aurora)         — atmospheric rose aurora
 * Stage 5: Twin       (06-cloud-dune)     — earth-scale grounding
 */
const STAGES = [
  { src: '/images/cosmic/aux-starry-clouds.jpg',    pos: 'center' },
  { src: '/images/cosmic/01-space-earth.jpg',       pos: 'center' },
  { src: '/images/cosmic-v2/stage3-arrival.jpg',    pos: 'center' },
  { src: '/images/cosmic/04-aurora.jpg',            pos: 'center 55%' },
  { src: '/images/cosmic-v2/stage5-horizon.jpg',    pos: 'center' },
];

/** Star particle layer — canvas-based. Rendered INSIDE sticky container so it's
 *  clipped to the cosmic hero section (no leaking into Services / Footer). */
function StarField({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    const stars: Array<{ x: number; y: number; r: number; a: number; da: number; vx: number }> = [];

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();

    const count = Math.min(140, Math.floor((w * h) / 12000));
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.2,
        a: Math.random() * 0.6 + 0.2,
        da: (Math.random() * 0.012 + 0.003) * (Math.random() > 0.5 ? 1 : -1),
        vx: (Math.random() - 0.5) * 0.03,
      });
    }

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.a += s.da;
        if (s.a < 0.15 || s.a > 0.9) s.da *= -1;
        s.x += s.vx;
        if (s.x < 0) s.x = w; else if (s.x > w) s.x = 0;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245,240,235,${s.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}

const CosmicHero = ({ isSignedIn, isLoaded, onDashboard, onDiscover, onDemo }: CosmicHeroProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  /* Manual scroll progress — framer's useScroll gets confused by Lenis's
   * smooth-scroll, so we compute progress ourselves from the container rect. */
  const scrollYProgress = useMotionValue(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const range = rect.height - vh;
      const p = range > 0 ? Math.max(0, Math.min(1, -rect.top / range)) : 0;
      scrollYProgress.set(p);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
  }, [scrollYProgress]);

  // Each stage occupies 1/N of the scroll range, with soft cross-fade overlap.
  const N = STAGES.length;
  const bandWidth = 1 / N;
  const overlap = bandWidth * 0.45;

  // Hook order must be stable. Precompute MotionValues for each stage.
  const op0 = useTransform(
    scrollYProgress,
    [0, bandWidth - overlap, bandWidth + overlap],
    [1, 1, 0],
  );
  const op1 = useTransform(
    scrollYProgress,
    [bandWidth - overlap, bandWidth + overlap, 2 * bandWidth - overlap, 2 * bandWidth + overlap],
    [0, 1, 1, 0],
  );
  const op2 = useTransform(
    scrollYProgress,
    [2 * bandWidth - overlap, 2 * bandWidth + overlap, 3 * bandWidth - overlap, 3 * bandWidth + overlap],
    [0, 1, 1, 0],
  );
  const op3 = useTransform(
    scrollYProgress,
    [3 * bandWidth - overlap, 3 * bandWidth + overlap, 4 * bandWidth - overlap, 4 * bandWidth + overlap],
    [0, 1, 1, 0],
  );
  const op4 = useTransform(
    scrollYProgress,
    [4 * bandWidth - overlap, 4 * bandWidth + overlap, 1],
    [0, 1, 1],
  );
  const stageOpacities = useMemo(() => [op0, op1, op2, op3, op4], [op0, op1, op2, op3, op4]);

  // Subtle zoom-in on the bg as user scrolls (parallax feel).
  const bgScale = useTransform(scrollYProgress, [0, 1], [1.08, 1.0]);

  const starsActive = !reduceMotion && !isMobile;

  // Soft fade band at the end so Stage 5 transitions smoothly to the dark platforms strip.
  const endFadeOpacity = useTransform(scrollYProgress, [0.88, 1], [0, 1]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ height: '500vh' }}
    >
      {/* Sticky background stack */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {STAGES.map((stage, i) => (
          <motion.div
            key={stage.src}
            aria-hidden
            className="absolute inset-0"
            style={{
              opacity: stageOpacities[i],
              backgroundImage: `url(${stage.src})`,
              backgroundSize: 'cover',
              backgroundPosition: stage.pos,
              willChange: 'opacity',
            }}
          />
        ))}

        {/* Rose-amber glow matching Ghibli mockup palette */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 95%, rgba(245,180,150,0.22) 0%, transparent 55%),' +
              'radial-gradient(ellipse at 10% 10%, rgba(93,92,174,0.18) 0%, transparent 50%)',
            mixBlendMode: 'screen',
          }}
        />

        {/* Vertical darken: top deep indigo, bottom warm — mockup reference */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,18,26,0.55) 0%, rgba(19,18,26,0.15) 35%, rgba(19,18,26,0.05) 65%, rgba(40,20,30,0.15) 100%)',
          }}
        />

        {/* Subtle scale/zoom on the whole stack */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ scale: bgScale, originX: 0.5, originY: 0.5 }}
        />

        <StarField active={starsActive} />

        {/* Soft vignette so content stays readable — lighter than before */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 55%, rgba(19,18,26,0.35) 100%)',
          }}
        />

        {/* End-of-hero fade: bottom half transitions to charcoal before the next section */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: endFadeOpacity,
            background:
              'linear-gradient(180deg, transparent 0%, transparent 40%, rgba(19,18,26,0.85) 100%)',
          }}
        />
      </div>

      {/* Foreground stages — actual text content scrolls over the sticky bg */}
      <div className="absolute inset-0">
        {/* Stage 1 — Origin (matches Nano Banana Pro mockup) */}
        <Stage index={0}>
          <p className="cosmic-kicker">I.  ORIGIN</p>
          <h1 className="cosmic-h1 lowercase">
            we are made
            <br />
            of <em className="italic">stardust</em>
          </h1>
          <p className="cosmic-quote">
            "Perhaps we are searching in the branches for what we only find in the roots."
          </p>
        </Stage>

        {/* Stage 2 — Nebula */}
        <Stage index={1}>
          <p className="cosmic-kicker">II.  infinite variation</p>
          <h2 className="cosmic-h2">
            Every person is a <em className="italic">singular</em> outcome
            <br />
            of supernovas, particles, and cosmic accidents.
          </h2>
        </Stage>

        {/* Stage 3 — Atmosphere entry */}
        <Stage index={2}>
          <p className="cosmic-kicker">III.  arrival</p>
          <h2 className="cosmic-h2">
            From cosmic dust,
            <br />
            <em className="italic">a soul takes shape.</em>
          </h2>
        </Stage>

        {/* Stage 4 — Sky dream */}
        <Stage index={3}>
          <p className="cosmic-kicker">IV.  the body</p>
          <h2 className="cosmic-h2">
            Your footprints, your rhythms,
            <br />
            your rituals — all of it,
            <br />
            <em className="italic">evidence of who you are.</em>
          </h2>
        </Stage>

        {/* Stage 5 — Horizon / the twin */}
        <Stage index={4}>
          <p className="cosmic-kicker">V.  THE TWIN</p>
          <h2 className="cosmic-h2 mb-6">
            The <em className="italic">organic</em> meets
            <br />
            the <em className="italic">digital.</em>
          </h2>
          <p className="cosmic-sub mb-10">
            TwinMe reads your real data and builds a Soul Signature — a living portrait
            of the person behind the patterns.
          </p>
          <div className="flex flex-col items-center gap-3">
            {isLoaded && isSignedIn ? (
              <button
                onClick={onDashboard}
                className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={onDiscover}
                  className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5"
                >
                  Discover yourself <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onDemo}
                  className="text-xs bg-none border-none cursor-pointer text-[#C9C4BF] transition-colors hover:text-[#F5F0EB]"
                >
                  or try the demo
                </button>
              </>
            )}
          </div>
        </Stage>
      </div>
    </div>
  );
};

function Stage({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <section
      className="h-screen w-full flex items-center justify-center px-6"
      style={{ position: 'relative' }}
      data-stage={index}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.45, once: false }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-[640px] text-center flex flex-col items-center"
      >
        {children}
      </motion.div>
    </section>
  );
}

export default CosmicHero;
