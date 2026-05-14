/**
 * /meetings — Meeting Prep Agent surface
 * =======================================
 * Renan-style hero: "Next meeting in Xh — here's your prep" + structured
 * briefing card + (placeholder) action buttons for the agentic phase.
 *
 * Pulls from GET /api/meeting-briefings which surfaces what the
 * cron-meeting-prep cron has already produced. No new LLM calls at view
 * time — this is a read-only surface for already-computed briefings.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, Users, AlertCircle, Sparkles, Mail, CalendarPlus, RefreshCw, CheckSquare, ArrowRight, Heart } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchMeetingBriefings, type MeetingBriefing } from '@/services/api/meetingBriefingsAPI';
import { isAbortError } from '@/services/api/apiBase';

const GLASS: React.CSSProperties = {
  background: 'var(--glass-surface-bg)',
  border: '1px solid var(--glass-surface-border)',
  backdropFilter: 'blur(42px)',
  WebkitBackdropFilter: 'blur(42px)',
  borderRadius: 20,
};

const LABEL: React.CSSProperties = {
  fontFamily: "'Geist', 'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.45)',
};

function timeUntil(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return ms >= 0 ? 'agora mesmo' : 'agora';
  if (minutes < 60) return ms >= 0 ? `em ${minutes} min` : `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return ms >= 0 ? `em ${hours}h` : `há ${hours}h`;
  const days = Math.round(hours / 24);
  return ms >= 0 ? `em ${days}d` : `há ${days}d`;
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (e) return `${dayFmt.format(s)} · ${timeFmt.format(s)} – ${timeFmt.format(e)}`;
  return `${dayFmt.format(s)} · ${timeFmt.format(s)}`;
}

function DebriefSection({ debrief }: { debrief: NonNullable<MeetingBriefing['briefing']['debrief']> }) {
  return (
    <div
      className="mb-5 p-4 rounded-[14px]"
      style={{
        background: 'linear-gradient(135deg, rgba(93,92,174,0.12) 0%, rgba(255,255,255,0.03) 75%)',
        border: '1px solid rgba(93,92,174,0.28)',
      }}
    >
      <p style={{ ...LABEL, color: 'rgba(165,164,224,0.90)', marginBottom: 8 }}>
        <RefreshCw className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> Depois da reunião — leitura do twin
      </p>

      {debrief.summary && (
        <p
          className="mb-3"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 16,
            color: 'rgba(255,255,255,0.85)',
            lineHeight: 1.4,
            letterSpacing: '-0.01em',
          }}
        >
          {debrief.summary}
        </p>
      )}

      {debrief.likelyCovered && debrief.likelyCovered.length > 0 && (
        <div className="mb-3">
          <p style={{ ...LABEL, fontSize: 10, marginBottom: 6 }}>Provavelmente abordado</p>
          <ul className="space-y-1">
            {debrief.likelyCovered.map((t, i) => (
              <li
                key={i}
                className="pl-3"
                style={{
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.75)',
                  lineHeight: 1.5,
                  borderLeft: '2px solid rgba(93,92,174,0.4)',
                }}
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {debrief.probableActionItems && debrief.probableActionItems.length > 0 && (
        <div className="mb-3">
          <p style={{ ...LABEL, fontSize: 10, marginBottom: 6 }}>
            <CheckSquare className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Ações prováveis
          </p>
          <div className="space-y-1.5">
            {debrief.probableActionItems.map((ai, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <span
                  className="px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    fontFamily: "'Geist', 'Inter', sans-serif",
                    fontSize: 9.5,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background: ai.owner === 'me' ? 'rgba(193,126,44,0.18)' : 'rgba(255,255,255,0.06)',
                    color: ai.owner === 'me' ? 'rgba(232,160,80,0.95)' : 'rgba(255,255,255,0.55)',
                  }}
                >
                  {ai.owner === 'me' ? 'você' : ai.owner}
                </span>
                <span
                  style={{
                    fontFamily: "'Geist', 'Inter', sans-serif",
                    fontSize: 12.5,
                    color: 'rgba(255,255,255,0.85)',
                    lineHeight: 1.45,
                  }}
                >
                  {ai.task}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {debrief.followUpsRecommended && debrief.followUpsRecommended.length > 0 && (
        <div className="mb-3">
          <p style={{ ...LABEL, fontSize: 10, marginBottom: 6 }}>
            <ArrowRight className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Próximos passos sugeridos
          </p>
          <ul className="space-y-1">
            {debrief.followUpsRecommended.map((f, i) => (
              <li
                key={i}
                className="pl-3"
                style={{
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.80)',
                  lineHeight: 1.5,
                  borderLeft: '2px solid rgba(232,160,80,0.4)',
                }}
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {debrief.relationshipNotes && debrief.relationshipNotes.length > 0 && (
        <div>
          <p style={{ ...LABEL, fontSize: 10, marginBottom: 6 }}>
            <Heart className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Pra lembrar
          </p>
          <div className="space-y-1.5">
            {debrief.relationshipNotes.map((rn, i) => (
              <p
                key={i}
                style={{
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.72)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>{rn.person}:</span>{' '}
                {rn.note}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BriefingCard({ briefing, isHero }: { briefing: MeetingBriefing; isHero: boolean }) {
  const b = briefing.briefing || {};
  const title = briefing.summary || briefing.headline || 'Reunião sem título';
  const until = timeUntil(briefing.startTime);
  const range = formatTimeRange(briefing.startTime, briefing.endTime);
  const hasDebrief = !!b.debrief;

  return (
    <div
      style={{
        ...GLASS,
        padding: isHero ? '28px 28px 24px' : '20px 22px',
        background: isHero
          ? 'linear-gradient(135deg, rgba(193,126,44,0.10) 0%, rgba(255,255,255,0.04) 70%)'
          : 'var(--glass-surface-bg)',
        borderColor: isHero ? 'rgba(193,126,44,0.30)' : 'var(--glass-surface-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          {until && (
            <p style={{ ...LABEL, color: isHero ? 'rgba(232,160,80,0.85)' : LABEL.color, marginBottom: 6 }}>
              {until}
            </p>
          )}
          <h2
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: isHero ? 26 : 20,
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
              lineHeight: 1.15,
              marginBottom: 4,
            }}
          >
            {title}
          </h2>
          {range && (
            <p
              className="flex items-center gap-1.5"
              style={{
                fontFamily: "'Geist', 'Inter', sans-serif",
                fontSize: 12,
                color: 'rgba(255,255,255,0.50)',
              }}
            >
              <Clock className="w-3 h-3" />
              {range}
            </p>
          )}
        </div>
      </div>

      {/* Headline tagline from briefing */}
      {b.headline && b.headline !== title && (
        <p
          className="mb-4"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 16,
            color: 'rgba(255,255,255,0.78)',
            lineHeight: 1.4,
            letterSpacing: '-0.01em',
          }}
        >
          {b.headline}
        </p>
      )}

      {/* Post-meeting debrief — leads when present. The prep content below
          becomes reference ("what the twin prepped") once the debrief lands. */}
      {hasDebrief && b.debrief && <DebriefSection debrief={b.debrief} />}

      {hasDebrief && (
        <p style={{ ...LABEL, fontSize: 10, marginBottom: 8, color: 'rgba(255,255,255,0.35)' }}>
          O que o twin preparou antes
        </p>
      )}

      {/* Attendees */}
      {b.attendees && b.attendees.length > 0 && (
        <div className="mb-4">
          <p style={{ ...LABEL, marginBottom: 8 }}>
            <Users className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> Quem está na sala
          </p>
          <div className="space-y-2">
            {b.attendees.map((a, i) => (
              <div
                key={i}
                className="px-3 py-2 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <p
                  style={{
                    fontFamily: "'Geist', 'Inter', sans-serif",
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--foreground)',
                  }}
                >
                  {a.name}
                  {(a.company || a.title) && (
                    <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>
                      {' '}— {a.title}{a.title && a.company ? ', ' : ''}{a.company}
                    </span>
                  )}
                </p>
                {a.whoTheyAre && (
                  <p
                    style={{
                      fontFamily: "'Geist', 'Inter', sans-serif",
                      fontSize: 12.5,
                      color: 'rgba(255,255,255,0.65)',
                      lineHeight: 1.5,
                      marginTop: 4,
                    }}
                  >
                    {a.whoTheyAre}
                  </p>
                )}
                {a.lastTouchpoint && (
                  <p
                    style={{
                      fontFamily: "'Geist', 'Inter', sans-serif",
                      fontSize: 11.5,
                      color: 'rgba(255,255,255,0.45)',
                      marginTop: 4,
                      fontStyle: 'italic',
                    }}
                  >
                    Último contato: {a.lastTouchpoint}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Talking points */}
      {b.talkingPoints && b.talkingPoints.length > 0 && (
        <div className="mb-4">
          <p style={{ ...LABEL, marginBottom: 8 }}>
            <Sparkles className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> Pontos a abordar
          </p>
          <ul className="space-y-1.5">
            {b.talkingPoints.map((tp, i) => (
              <li
                key={i}
                className="pl-3"
                style={{
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.85)',
                  lineHeight: 1.5,
                  borderLeft: '2px solid rgba(193,126,44,0.4)',
                }}
              >
                {tp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Watch-outs */}
      {b.watchOuts && b.watchOuts.length > 0 && (
        <div className="mb-4">
          <p style={{ ...LABEL, color: 'rgba(248,113,113,0.85)', marginBottom: 8 }}>
            <AlertCircle className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> Cuidados
          </p>
          <ul className="space-y-1.5">
            {b.watchOuts.map((w, i) => (
              <li
                key={i}
                className="pl-3"
                style={{
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.80)',
                  lineHeight: 1.5,
                  borderLeft: '2px solid rgba(248,113,113,0.35)',
                }}
              >
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* My context */}
      {b.myContext && (
        <div className="mb-4">
          <p style={{ ...LABEL, marginBottom: 6 }}>O que você traz</p>
          <p
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 13,
              color: 'rgba(255,255,255,0.70)',
              lineHeight: 1.5,
            }}
          >
            {b.myContext}
          </p>
        </div>
      )}

      {/* Action row (Phase 2/3 placeholders — wired to twin chat for now) */}
      <div className="flex flex-wrap items-center gap-2 mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {briefing.meetingUrl && (
          <a
            href={briefing.meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[100px] transition-colors"
            style={{
              background: '#F5F5F4',
              color: '#110f0f',
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <Calendar className="w-3 h-3" /> Abrir reunião
          </a>
        )}
        <button
          type="button"
          disabled
          title="Em breve — twin envia um e-mail de recap após a reunião"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[100px] transition-colors disabled:opacity-40"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.65)',
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <Mail className="w-3 h-3" /> Recap por e-mail
        </button>
        <button
          type="button"
          disabled
          title="Em breve — twin propõe horário pra próxima"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[100px] transition-colors disabled:opacity-40"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.65)',
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <CalendarPlus className="w-3 h-3" /> Agendar follow-up
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ ...GLASS, padding: 32, textAlign: 'center' }}>
      <Calendar className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.20)' }} />
      <p
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 18,
          color: 'rgba(255,255,255,0.70)',
          marginBottom: 6,
          letterSpacing: '-0.01em',
        }}
      >
        Nenhuma reunião por aqui ainda
      </p>
      <p
        style={{
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontSize: 13,
          color: 'rgba(255,255,255,0.45)',
          lineHeight: 1.6,
        }}
      >
        Quando você tiver reuniões agendadas no Google Calendar com convidados externos,<br />
        o twin gera um briefing automático aqui — uma hora antes você sabe quem é quem,<br />
        o que falar, e o que evitar.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{ ...GLASS, padding: 24 }}
        >
          <div className="h-3 w-20 rounded mb-3" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="h-5 w-3/4 rounded mb-2" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="h-3 w-1/3 rounded mb-4" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="h-3 w-full rounded mb-2" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="h-3 w-5/6 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
        </div>
      ))}
    </div>
  );
}

export default function MeetingsPage() {
  useDocumentTitle('Meetings · TwinMe');

  const [upcoming, setUpcoming] = useState<MeetingBriefing[]>([]);
  const [recent, setRecent] = useState<MeetingBriefing[]>([]);
  const [undated, setUndated] = useState<MeetingBriefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchMeetingBriefings(controller.signal);
        if (!res.success) {
          setError(res.error || 'Falha ao carregar briefings');
          return;
        }
        setUpcoming(res.upcoming || []);
        setRecent(res.recent || []);
        setUndated(res.undated || []);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'unknown error');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const hasAny = upcoming.length + recent.length + undated.length > 0;
  const hero = useMemo(() => upcoming[0] ?? null, [upcoming]);
  const restUpcoming = useMemo(() => upcoming.slice(1), [upcoming]);

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 pb-24">
      {/* Header */}
      <div className="pt-6 mb-1">
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 36,
            letterSpacing: '-0.03em',
            color: 'var(--foreground)',
            lineHeight: 1.05,
          }}
        >
          Meetings
        </h1>
      </div>
      <p
        className="mb-6"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 19,
          lineHeight: 1.4,
          color: 'rgba(255,255,255,0.70)',
          letterSpacing: '-0.01em',
        }}
      >
        Seu twin chega antes de você. Em cada reunião.
      </p>

      {error && (
        <div
          className="mb-6 px-4 py-3 flex items-start gap-3"
          style={{
            ...GLASS,
            background: 'rgba(220, 38, 38, 0.08)',
            borderColor: 'rgba(220, 38, 38, 0.25)',
          }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(252, 165, 165, 0.95)' }} />
          <p
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 13,
              color: 'rgba(254, 202, 202, 0.95)',
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && !hasAny && <EmptyState />}

      {!loading && hero && (
        <>
          <p style={{ ...LABEL, marginBottom: 10 }}>Próxima</p>
          <div className="mb-8">
            <BriefingCard briefing={hero} isHero />
          </div>
        </>
      )}

      {!loading && restUpcoming.length > 0 && (
        <>
          <p style={{ ...LABEL, marginBottom: 10 }}>Em breve · {restUpcoming.length}</p>
          <div className="space-y-4 mb-8">
            {restUpcoming.map((m) => (
              <BriefingCard key={m.id} briefing={m} isHero={false} />
            ))}
          </div>
        </>
      )}

      {!loading && recent.length > 0 && (
        <>
          <p style={{ ...LABEL, marginBottom: 10 }}>
            <RefreshCw className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> Últimas · {recent.length}
          </p>
          <div className="space-y-4 mb-8">
            {recent.map((m) => (
              <BriefingCard key={m.id} briefing={m} isHero={false} />
            ))}
          </div>
        </>
      )}

      {!loading && undated.length > 0 && (
        <>
          <p style={{ ...LABEL, marginBottom: 10 }}>Sem horário · {undated.length}</p>
          <div className="space-y-4">
            {undated.map((m) => (
              <BriefingCard key={m.id} briefing={m} isHero={false} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
