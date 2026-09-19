/**
 * /preview/presence-voice (dev only): her call page's voice surface, driven by a
 * synthetic voice so the glow and the orb can be judged without a microphone.
 * The same VoiceBeam props as PresenceCallPage; keep them in step.
 */
import { useEffect, useRef, useState } from 'react';
import { VoiceBeam } from 'voice-glow';
import LedgerOrb from '@/components/LedgerOrb';
import { orbFor, type CallState, type OrbMode } from '@/pages/presence/callOrb';
import '@/styles/presence-cosmos.css';
import '@/styles/presence-call.css';

const SCENES: Array<{ id: string; label: string; state: CallState; mode: OrbMode; voice: 'her' | 'presence' | 'none' }> = [
  { id: 'ready', label: 'Esperando ela', state: 'ready', mode: 'idle', voice: 'none' },
  { id: 'connecting', label: 'Conectando', state: 'connecting', mode: 'idle', voice: 'none' },
  { id: 'listening', label: 'Ela fala', state: 'live', mode: 'listening', voice: 'her' },
  { id: 'speaking', label: 'A presença fala', state: 'live', mode: 'speaking', voice: 'presence' },
  { id: 'pause', label: 'Pausa na conversa', state: 'live', mode: 'idle', voice: 'none' },
  { id: 'saving', label: 'Guardando', state: 'saving', mode: 'idle', voice: 'none' },
];

export default function PresenceVoicePreview() {
  const [scene, setScene] = useState(SCENES[2]);
  const levelRef = useRef(0);

  // A synthetic voice: syllables at about four a second under a slow swell.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const syllable = Math.max(0, Math.sin(t * 8.5)) ** 1.6;
      const swell = 0.55 + 0.45 * Math.sin(t * 0.7);
      levelRef.current = scene.voice === 'none' ? 0 : Math.min(1, syllable * swell * (scene.voice === 'her' ? 0.9 : 1.1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  const orb = orbFor(scene.state, scene.mode);
  const glowActive = scene.state === 'connecting' || scene.state === 'live' || scene.state === 'saving';

  return (
    <main className="presence-cosmos cal pc-call" id="main-content">
      <VoiceBeam
        type="mobile"
        theme="light"
        colorVariant="mono"
        staticColors
        colors={['#251f21', '#585254', '#6c6867', '#969394']}
        bandColors={{ core: '#251f21', above: '#585254', mid: '#6c6867', below: '#969394' }}
        bandAberration={0}
        brightness={1.7}
        saturation={0.3}
        coreLight={0}
        strength={1}
        level={() => levelRef.current}
        active={glowActive}
        processing={scene.state === 'connecting' || scene.state === 'saving'}
        idle={0.14}
        distortion={0.25}
        className="pc-call-glow"
        aria-hidden="true"
      >
        <span />
      </VoiceBeam>
      <div className="pc-call-brand" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SCENES.map((s) => (
          <button key={s.id} className={`pc-call-cta pc-call-cta--ghost`} style={{ minHeight: 36, padding: '0 12px', fontSize: 13, opacity: s.id === scene.id ? 1 : 0.55 }} onClick={() => setScene(s)}>
            {s.label}
          </button>
        ))}
      </div>
      <section className={`pc-call-stage ${scene.state === 'live' ? 'is-live' : ''}`}>
        {orb ? (
          <div className={`pc-orb-wrap is-${scene.mode}`} aria-hidden="true">
            <LedgerOrb state={orb.state} size={orb.size} speed={orb.speed} label="" />
          </div>
        ) : null}
        {scene.state === 'ready' && <h1>Oi, Sofia.</h1>}
        {scene.state === 'connecting' && <h1>Conectando…</h1>}
        {scene.state === 'live' && <p className="pc-call-status">{scene.mode === 'speaking' ? 'Falando com você…' : 'Estou te ouvindo.'}</p>}
        {scene.state === 'saving' && <h1>Guardando a conversa…</h1>}
      </section>
      <p className="pc-call-footer">Uma inteligência artificial criada por sua família. Sempre diz que é IA.</p>
    </main>
  );
}
