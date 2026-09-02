import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Conversation } from '@elevenlabs/client';
import {
  completeCall,
  fetchCallConfig,
  fetchCallHome,
  type PresenceCallConfig,
  type PresenceCallHome,
} from '@/services/api/presenceAPI';
import '@/styles/presence-cosmos.css';

/**
 * /call/:token — her side of Presence: a home, not just a button.
 *
 * Two modes on one URL, because she should never have to navigate:
 *   HOME  — greeting, the talk button, whether a note is waiting (and from whom),
 *           and her own past conversations in her words.
 *   CALL  — orb reacting to audio + live transcript in the glass panel.
 *
 * Privacy line: her home renders only what is hers. The family's digest — summaries,
 * "needs you" items, care signals — is never fetched here (see the /home endpoint).
 * A waiting note shows that it exists and who it is from; the words themselves are
 * delivered aloud, as coming from their author, inside the conversation.
 */

type CallState = 'loading' | 'invalid' | 'ready' | 'connecting' | 'live' | 'saving' | 'done' | 'error';

type Turn = { role: 'user' | 'assistant'; content: string };

function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" />
      <circle cx="14" cy="5" r="2.7" />
      <circle cx="23" cy="5" r="2.7" />
      <circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" />
      <circle cx="14" cy="23" r="2.7" />
      <circle cx="5" cy="23" r="2.7" />
      <circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

/** Warm, non-numeric day naming — an elder reads "ontem", not "01/09". */
function whenLabel(iso: string) {
  try {
    const then = new Date(iso);
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);
    if (days <= 0) return 'Hoje';
    if (days === 1) return 'Ontem';
    if (days < 7) return then.toLocaleDateString('pt-BR', { weekday: 'long' });
    return then.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

export default function PresenceCallPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<CallState>('loading');
  const [config, setConfig] = useState<PresenceCallConfig | null>(null);
  const [home, setHome] = useState<PresenceCallHome | null>(null);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [orbMode, setOrbMode] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [explain, setExplain] = useState(false);
  const sessionRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);
  const transcriptRef = useRef<Turn[]>([]);
  const startedAtRef = useRef<number>(0);
  const savedRef = useRef(false);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const volumeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const loadHome = useCallback(async () => {
    const data = await fetchCallHome(token);
    if (data) setHome(data);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [call, homeData] = await Promise.all([fetchCallConfig(token), fetchCallHome(token)]);
      if (cancelled) return;
      if (!call) {
        setState('invalid');
        return;
      }
      setConfig(call);
      setHome(homeData);
      setState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [transcript]);

  const stopVolumeLoop = useCallback(() => {
    if (volumeTimerRef.current) {
      clearInterval(volumeTimerRef.current);
      volumeTimerRef.current = null;
    }
    orbRef.current?.style.setProperty('--orb', '1');
    setOrbMode('idle');
  }, []);

  const startVolumeLoop = useCallback(() => {
    if (volumeTimerRef.current) return;
    volumeTimerRef.current = setInterval(() => {
      const session = sessionRef.current;
      const orb = orbRef.current;
      if (!session || !orb) return;
      try {
        const output = session.getOutputVolume();
        const input = session.getInputVolume();
        orb.style.setProperty('--orb', String(1 + Math.min(output * 0.5 + input * 0.22, 0.42)));
        setOrbMode(output > 0.06 ? 'speaking' : input > 0.06 ? 'listening' : 'idle');
      } catch {
        /* session mid-teardown */
      }
    }, 80);
  }, []);

  const saveConversation = useCallback(async () => {
    if (savedRef.current) return;
    savedRef.current = true;
    const seconds = startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;
    await completeCall(token, transcriptRef.current, seconds);
  }, [token]);

  useEffect(() => {
    const onUnload = () => {
      if (sessionRef.current && !savedRef.current && transcriptRef.current.length > 0) {
        savedRef.current = true;
        const seconds = startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;
        navigator.sendBeacon?.(
          `${location.origin}/api/presence-call/${encodeURIComponent(token)}/complete`,
          new Blob([JSON.stringify({ transcript: transcriptRef.current, duration_seconds: seconds })], { type: 'application/json' }),
        );
      }
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [token]);

  useEffect(() => {
    return () => {
      stopVolumeLoop();
      sessionRef.current?.endSession();
      sessionRef.current = null;
    };
  }, [stopVolumeLoop]);

  async function startCall() {
    if (!config) return;
    setExplain(false);
    setState('connecting');
    setTranscript([]);
    transcriptRef.current = [];
    savedRef.current = false;
    try {
      const session = await Conversation.startSession({
        agentId: config.agent_id,
        connectionType: 'webrtc',
        overrides: {
          agent: {
            prompt: { prompt: config.prompt },
            firstMessage: config.first_message,
            language: config.language || 'pt',
          },
          ...(config.voice_id ? { tts: { voiceId: config.voice_id } } : {}),
        },
        onConnect: () => {
          startedAtRef.current = Date.now();
          setState('live');
          startVolumeLoop();
        },
        onMessage: (payload: { message?: string; source?: string }) => {
          const content = typeof payload?.message === 'string' ? payload.message : '';
          if (!content) return;
          const role = payload?.source === 'user' ? 'user' : 'assistant';
          const turn: Turn = { role, content };
          transcriptRef.current.push(turn);
          setTranscript((current) => [...current, turn]);
        },
        onDisconnect: () => {
          sessionRef.current = null;
          stopVolumeLoop();
          setState('saving');
          void saveConversation().finally(() => setState('done'));
        },
        onError: () => {
          stopVolumeLoop();
          setState('error');
        },
      });
      sessionRef.current = session;
    } catch {
      setState('error');
    }
  }

  async function endCall() {
    const session = sessionRef.current;
    sessionRef.current = null;
    stopVolumeLoop();
    setState('saving');
    try {
      await session?.endSession();
    } catch {
      /* the transcript still saves */
    }
    await saveConversation();
    setState('done');
  }

  /** Back to home after a call: refresh her recaps so the new one appears. */
  function backHome() {
    setState('ready');
    void loadHome();
  }

  const name = config?.cared_for_name?.trim() || '';
  const caller = config?.caller_name?.trim() || 'sua família';
  const waiting = home?.waiting_notes ?? 0;
  const recaps = home?.conversations ?? [];

  const explainCard = explain ? (
    <div className="pc-call-explain" role="note">
      <strong>Quem está falando com você?</strong> Uma presença de inteligência artificial que {caller} criou,
      com carinho, para conversar com você quando quiser. Ela sempre diz que é IA. Ela nunca promete visitas,
      não fala de dinheiro nem de remédios, e nunca fala em nome de {caller} — só passa recados que {caller} mesmo escreveu.
    </div>
  ) : null;

  const homeBlocks = (
    <div className="pc-call-home">
      {waiting > 0 && (
        <div className="pc-home-note">
          <span className="pc-home-note-dot" aria-hidden="true" />
          <p>
            {caller} deixou {waiting === 1 ? 'um recado' : `${waiting} recados`} para você.
            <small>{waiting === 1 ? 'Ele aparece' : 'Eles aparecem'} na nossa próxima conversa.</small>
          </p>
        </div>
      )}

      {recaps.length > 0 && (
        <div className="pc-home-recaps">
          <h2>Nossas conversas</h2>
          {recaps.map((c) => (
            <div className="pc-home-recap" key={c.id}>
              <span>{whenLabel(c.started_at)}</span>
              <p>{c.recap}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <main className="presence-cosmos pc-call" id="main-content">
      <div className="pc-call-brand"><Mark /> Presença</div>

      <section className={`pc-call-stage ${state === 'live' ? 'is-live' : ''}`} aria-live="polite">
        {state === 'loading' && <p className="pc-call-sub">Um momento…</p>}

        {state === 'invalid' && (
          <>
            <h1>Este link não está mais ativo.</h1>
            <p className="pc-call-sub">Peça um link novo para a sua família.</p>
          </>
        )}

        {(state === 'ready' || state === 'connecting') && (
          <>
            <div className="pc-orb" aria-hidden="true" />
            <h1>{name ? `Oi, ${name}.` : 'Oi.'}</h1>
            <p className="pc-call-sub">A presença de {caller} está aqui para conversar com você. Sem pressa nenhuma.</p>
            <div className="pc-call-actions">
              <button className="pc-call-cta" onClick={startCall} disabled={state === 'connecting'}>
                {state === 'connecting' ? 'Conectando…' : 'Começar a conversa'}
              </button>
              <button className="pc-call-cta pc-call-cta--ghost" onClick={() => setExplain((v) => !v)} aria-expanded={explain}>
                Quem está falando?
              </button>
            </div>
            {explainCard}
            {homeBlocks}
          </>
        )}

        {state === 'live' && (
          <>
            <div ref={orbRef} className={`pc-orb is-${orbMode}`} aria-hidden="true" />
            <p className="pc-call-status">
              {orbMode === 'speaking' ? 'Falando com você…' : 'Estou te ouvindo.'}
            </p>
            <div ref={panelRef} className="pc-transcript" aria-label="Transcrição da conversa">
              {transcript.map((turn, index) => (
                <div className={`pc-transcript-row ${turn.role === 'user' ? 'is-user' : ''}`} key={index}>
                  <span>{turn.role === 'user' ? (name || 'Você') : `Presença de ${caller}`}</span>
                  <p>{turn.content}</p>
                </div>
              ))}
            </div>
            <div className="pc-call-actions">
              <button className="pc-call-cta pc-call-cta--ghost" onClick={endCall}>Terminar a conversa</button>
            </div>
          </>
        )}

        {state === 'saving' && <h1>Guardando a conversa…</h1>}

        {state === 'done' && (
          <>
            <div className="pc-orb" aria-hidden="true" />
            <h1>Que conversa boa.</h1>
            <p className="pc-call-sub">{caller} vai receber um resumo com carinho. Volte quando quiser.</p>
            <div className="pc-call-actions">
              <button className="pc-call-cta" onClick={backHome}>Voltar ao início</button>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <p className="pc-call-error">Não consegui te ouvir. Veja se o microfone está permitido e tente de novo.</p>
            <div className="pc-call-actions">
              <button className="pc-call-cta" onClick={startCall}>Tentar de novo</button>
            </div>
          </>
        )}
      </section>

      <p className="pc-call-footer">
        <ShieldCheck size={16} />
        Uma presença de inteligência artificial criada por {caller}. Sempre se identifica como IA e nunca fala em nome da família.
      </p>
    </main>
  );
}
