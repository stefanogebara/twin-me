/**
 * /presence/voice — recording the family member's own voice, and hearing it back.
 *
 * The backend for this has existed since Phase 1 and nothing ever called it:
 * POST /:id/voice-samples clones through ElevenLabs instant voice cloning and
 * adds later samples to the same voice, gated on a recorded `own_voice`
 * consent. The settings page could remove a voice there was no way to make.
 *
 * Three steps, in the order that respects the person: say what happens to
 * their voice and take their consent, record, then listen. The listening step
 * is not decoration — Eleven v3 Conversational is documented not to preserve
 * professional clones, and says nothing about instant ones, so whether Ana's
 * voice survives expressive delivery is a question only her ears answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, Mic, Play, Square, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  presenceAPI,
  PresenceApiError,
  type PresenceOverview,
  type PresenceVoiceModel,
} from '@/services/api/presenceAPI';
import '@/styles/presence-cosmos.css';

/** The consent text, versioned: what the person agreed to is what was on screen. */
const CONSENT_VERSION = 'presence-own-voice-v1';

/**
 * Three passages, chosen for prosody rather than length: a greeting carries
 * warmth, a memory carries rhythm and pauses, a question carries the rise at
 * the end. A clone built on one flat paragraph reads back flat.
 */
const PASSAGES = [
  {
    id: 'greeting',
    label: 'Um oi',
    hint: 'Fale como se ela tivesse acabado de atender.',
    text: 'Oi! Ai, que bom te ouvir... tudo bem com cê? Tava com saudade de conversar contigo, viu.',
  },
  {
    id: 'memory',
    label: 'Uma lembrança',
    hint: 'Sem pressa. Deixe as pausas onde elas caem.',
    text: 'Lembra daquele domingo na casa da praia? A gente ficou a tarde inteira na cozinha, você contando história, e ninguém queria ir embora. Foi um dos dias mais bonitos que eu lembro.',
  },
  {
    id: 'question',
    label: 'Uma pergunta',
    hint: 'Termine perguntando de verdade, e pare.',
    text: 'E aí, como foi o seu dia hoje? Conta pra mim. Você comeu direitinho? Quem que passou aí?',
  },
] as const;

const MODELS: Array<{ id: PresenceVoiceModel; label: string; line: string }> = [
  { id: 'eleven_v3_conversational', label: 'Expressivo', line: 'O que as ligações usam hoje. Mais emoção, 280 ms.' },
  { id: 'eleven_flash_v2_5', label: 'Rápido', line: 'Preserva melhor o timbre clonado. 75 ms.' },
  { id: 'eleven_multilingual_v2', label: 'Fiel', line: 'O mais fiel ao original, e o mais lento.' },
];

type Rec = 'idle' | 'recording' | 'sending';

export default function PresenceVoiceSetup() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<PresenceOverview | null>(null);
  const [state, setState] = useState<'loading' | 'none' | 'ready' | 'error'>('loading');
  const [consented, setConsented] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [rec, setRec] = useState<Rec>('idle');
  const [recording, setRecording] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<PresenceVoiceModel | null>(null);
  const [busyModel, setBusyModel] = useState<PresenceVoiceModel | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await presenceAPI.mine();
      if (!data.presence) { setState('none'); return; }
      const full = await presenceAPI.overview(data.presence.id);
      if (!('presence' in full)) { setState('none'); return; }
      setOverview(full as PresenceOverview);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Nothing of the person's microphone outlives this page.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  useEffect(() => {
    if (rec !== 'recording') return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [rec]);

  if (state === 'loading') {
    return <main className="presence-cosmos pc-app dsh"><div className="pc-shell"><div className="pc-empty">Carregando...</div></div></main>;
  }
  if (state !== 'ready' || !overview) {
    return (
      <main className="presence-cosmos pc-app dsh">
        <div className="pc-shell">
          <div className="pc-empty">Não foi possível abrir a sua Presença.</div>
          <button className="pc-btn pc-btn--ghost" onClick={() => navigate('/presence/home')}>Voltar</button>
        </div>
      </main>
    );
  }

  const presence = overview.presence;
  const voice = overview.voice;
  const voiceReady = voice?.status === 'ready';
  const caller = presence.caller_name?.trim() || 'você';

  async function giveConsent() {
    setConsentBusy(true);
    setError(null);
    try {
      await presenceAPI.consent(presence.id, 'own_voice', CONSENT_VERSION);
      setConsented(true);
    } catch (err) {
      setError(err instanceof PresenceApiError ? err.message : 'Não deu para registrar agora.');
    }
    setConsentBusy(false);
  }

  async function startRecording(passageId: string) {
    setError(null);
    setNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      setSeconds(0);
      setRecording(passageId);
      setRec('recording');
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.start();
    } catch {
      setError('O microfone não abriu. Verifique a permissão do navegador.');
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    const passageId = recording;
    if (!recorder || !passageId) return;
    const held = seconds;
    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setRec('sending');
      try {
        const result = await presenceAPI.uploadVoiceSample(presence.id, blob, held);
        setDone((d) => (d.includes(passageId) ? d : [...d, passageId]));
        setNote(result.voice?.note || 'Amostra enviada.');
        await load();
      } catch (err) {
        setError(err instanceof PresenceApiError ? err.message : 'O envio falhou.');
      }
      setRec('idle');
      setRecording(null);
      setSeconds(0);
    };
    recorder.stop();
  }

  async function hear(model: PresenceVoiceModel) {
    setBusyModel(model);
    setError(null);
    try {
      const blob = await presenceAPI.voicePreview(presence.id, model);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      const audio = new Audio(urlRef.current);
      audioRef.current = audio;
      audio.onended = () => setPlaying(null);
      setPlaying(model);
      await audio.play();
    } catch (err) {
      setError(err instanceof PresenceApiError ? err.message : 'Não deu para tocar agora.');
      setPlaying(null);
    }
    setBusyModel(null);
  }

  async function removeVoice() {
    if (!window.confirm('Remover a sua voz? Ela é apagada, e as ligações voltam para uma voz padrão.')) return;
    setVoiceBusy(true);
    setError(null);
    try {
      await presenceAPI.revokeVoice(presence.id);
      setDone([]);
      setConsented(false);
      await load();
    } catch (err) {
      setError(err instanceof PresenceApiError ? err.message : 'Não deu para remover agora.');
    }
    setVoiceBusy(false);
  }

  const canRecord = consented || voiceReady;

  return (
    <main className="presence-cosmos pc-app dsh" id="main-content">
      <div className="pc-shell pc-shell--single">
        <div className="pc-col">
        <Link className="pc-btn pc-btn--ghost" to="/presence/settings">
          <ArrowLeft size={14} aria-hidden="true" /> Configurações
        </Link>

        <header className="pc-apphead">
          <h1 className="pc-apphead-title">A sua voz</h1>
          <p className="pc-apphead-line">
            {voiceReady
              ? `As ligações dela usam a sua voz${voice?.sample_count ? ` · ${voice.sample_count} ${voice.sample_count === 1 ? 'amostra' : 'amostras'}` : ''}.`
              : 'Três trechos curtos, e ela passa a ouvir você.'}
          </p>
        </header>

        {/* ---- 1. consent ---- */}
        {!canRecord && (
          <section className="pc-appsection" aria-labelledby="consent-head">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title" id="consent-head">Antes de gravar</h2>
            </div>
            <ul className="pc-list">
              <li className="pc-row pc-row--plain"><div className="pc-row-text">
                <p className="pc-row-title">Uma cópia da sua voz fica guardada na ElevenLabs</p>
                <p className="pc-row-line">É lá que ela é gerada. As gravações em si não ficam com a gente.</p>
              </div></li>
              <li className="pc-row pc-row--plain"><div className="pc-row-text">
                <p className="pc-row-title">Ela é usada só nas ligações da sua Presença</p>
                <p className="pc-row-line">Em nenhum outro lugar, e por mais ninguém.</p>
              </div></li>
              <li className="pc-row pc-row--plain"><div className="pc-row-text">
                <p className="pc-row-title">A Presença sempre diz que é uma inteligência artificial</p>
                <p className="pc-row-line">Com a sua voz ou sem ela. Isso não muda nunca.</p>
              </div></li>
              <li className="pc-row pc-row--plain"><div className="pc-row-text">
                <p className="pc-row-title">Você pode remover quando quiser</p>
                <p className="pc-row-line">A voz é apagada de verdade, e as ligações voltam para uma voz padrão.</p>
              </div></li>
            </ul>
            <div style={{ marginTop: 20 }}>
              <button className="pc-btn pc-btn--primary" onClick={giveConsent} disabled={consentBusy}>
                {consentBusy ? <Loader2 className="pc-spin" size={14} /> : <Check size={14} />} Entendi, quero gravar a minha voz
              </button>
            </div>
          </section>
        )}

        {/* ---- 2. record ---- */}
        {canRecord && (
          <section className="pc-appsection" aria-labelledby="rec-head">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title" id="rec-head">Grave os três trechos</h2>
              <p className="pc-sechead-line">Num lugar silencioso, no seu ritmo. Cada um leva menos de um minuto.</p>
            </div>
            <ul className="pc-list">
              {PASSAGES.map((passage) => {
                const isDone = done.includes(passage.id);
                const isThis = recording === passage.id;
                return (
                  <li className="pc-row" key={passage.id}>
                    <span className="pc-row-icon" aria-hidden="true">
                      {isDone ? <Check /> : <Mic />}
                    </span>
                    <div className="pc-row-text">
                      <p className="pc-row-title">{passage.label}</p>
                      <p className="pc-row-line">{isThis ? passage.hint : passage.text}</p>
                    </div>
                    <div className="pc-row-action">
                      {isThis ? (
                        <button className="pc-btn pc-btn--danger" onClick={stopRecording}>
                          <Square size={14} /> Parar · {seconds}s
                        </button>
                      ) : (
                        <button
                          className="pc-btn pc-btn--ghost"
                          onClick={() => startRecording(passage.id)}
                          disabled={rec !== 'idle'}
                        >
                          {rec === 'sending' ? <Loader2 className="pc-spin" size={14} /> : <Mic size={14} />}
                          {isDone ? 'Gravar de novo' : 'Gravar'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {note ? <p className="pc-empty" role="status">{note}</p> : null}
          </section>
        )}

        {/* ---- 3. listen ---- */}
        {voiceReady && (
          <section className="pc-appsection" aria-labelledby="hear-head">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title" id="hear-head">Ouça você mesmo</h2>
              <p className="pc-sechead-line">
                A mesma frase que {caller} usa para abrir a ligação, na sua voz, em cada modelo.
              </p>
            </div>
            <ul className="pc-list">
              {MODELS.map((model) => (
                <li className="pc-row" key={model.id}>
                  <span className="pc-row-icon" aria-hidden="true"><Play /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">{model.label}</p>
                    <p className="pc-row-line">{model.line}</p>
                  </div>
                  <div className="pc-row-action">
                    <button className="pc-btn pc-btn--ghost" onClick={() => hear(model.id)} disabled={busyModel !== null}>
                      {busyModel === model.id
                        ? <Loader2 className="pc-spin" size={14} />
                        : <Play size={14} />}
                      {playing === model.id ? 'Tocando' : 'Ouvir'}
                    </button>
                  </div>
                </li>
              ))}
              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true"><Trash2 /></span>
                <div className="pc-row-text">
                  <p className="pc-row-title">Remover a minha voz</p>
                  <p className="pc-row-line">Ela é apagada, e as ligações voltam para uma voz padrão.</p>
                </div>
                <div className="pc-row-action">
                  <button className="pc-btn pc-btn--danger" onClick={removeVoice} disabled={voiceBusy}>
                    {voiceBusy ? <Loader2 className="pc-spin" size={14} /> : <Trash2 size={14} />} Remover
                  </button>
                </div>
              </li>
            </ul>
          </section>
        )}

        {error ? <p className="pc-empty" role="alert">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}
