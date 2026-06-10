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

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Calendar, Clock, Users, AlertCircle, Sparkles, Mail, CalendarPlus, RefreshCw, CheckSquare, ArrowRight, Heart, Loader2, ExternalLink, Check } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchMeetingBriefings, createMeetingRecap, scanMeetings, type MeetingBriefing, type RecapResponse } from '@/services/api/meetingBriefingsAPI';
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
  if (minutes < 1) return ms >= 0 ? 'right now' : 'just now';
  if (minutes < 60) return ms >= 0 ? `in ${minutes} min` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return ms >= 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return ms >= 0 ? `in ${days}d` : `${days}d ago`;
}

/**
 * "Today" / "Tomorrow" / "Yesterday" when the date is within a day of now —
 * otherwise null and the caller falls back to the weekday+date format.
 */
function relativeDayLabel(d: Date): string | null {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return null;
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: '2-digit', month: 'short' });
  const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
  const dayLabel = relativeDayLabel(s) || dayFmt.format(s);
  if (e) return `${dayLabel} · ${timeFmt.format(s)} – ${timeFmt.format(e)}`;
  return `${dayLabel} · ${timeFmt.format(s)}`;
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
        <RefreshCw className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> After the meeting — the twin's read
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
          <p style={{ ...LABEL, fontSize: 10, marginBottom: 6 }}>Likely covered</p>
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
            <CheckSquare className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Probable action items
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
                  {ai.owner === 'me' ? 'you' : ai.owner}
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
            <ArrowRight className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Suggested next steps
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
            <Heart className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Worth remembering
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

/**
 * Build a pre-filled Google Calendar "create event" URL from briefing data.
 * Client-side only — opens GCal's create form with title + attendees +
 * description pre-populated. The user picks the time and hits save, so the
 * actual calendar invite only goes out when THEY confirm it.
 */
function buildFollowUpUrl(briefing: MeetingBriefing): string {
  const base = briefing.summary || briefing.briefing?.headline || 'Meeting';
  const text = `Follow-up: ${base}`;
  const attendeeEmails = (briefing.attendees || [])
    .filter((a) => a.email && !a.organizer)
    .map((a) => a.email);
  const debrief = briefing.briefing?.debrief;
  const detailLines: string[] = [];
  if (debrief?.summary) detailLines.push(debrief.summary);
  if (debrief?.followUpsRecommended?.length) {
    detailLines.push('', 'Next steps:');
    debrief.followUpsRecommended.forEach((f) => detailLines.push(`- ${f}`));
  }
  const params = new URLSearchParams({ action: 'TEMPLATE', text });
  if (detailLines.length) params.set('details', detailLines.join('\n'));
  if (attendeeEmails.length) params.set('add', attendeeEmails.join(','));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

type CardVariant = 'inProgress' | 'hero' | 'normal';

// Per-variant surface styling. inProgress uses a restrained emerald — a
// status accent for "happening right now", distinct from the amber prep
// theme — hero keeps the amber prep gradient, normal is plain glass.
const VARIANT_STYLE: Record<CardVariant, {
  padding: string;
  background: string;
  borderColor: string;
  labelColor: string;
  titleSize: number;
}> = {
  inProgress: {
    padding: '28px 28px 24px',
    background: 'linear-gradient(135deg, rgba(52,168,110,0.12) 0%, rgba(255,255,255,0.04) 70%)',
    borderColor: 'rgba(52,168,110,0.32)',
    labelColor: 'rgba(110,210,160,0.95)',
    titleSize: 26,
  },
  hero: {
    padding: '28px 28px 24px',
    background: 'linear-gradient(135deg, rgba(193,126,44,0.10) 0%, rgba(255,255,255,0.04) 70%)',
    borderColor: 'rgba(193,126,44,0.30)',
    labelColor: 'rgba(232,160,80,0.85)',
    titleSize: 26,
  },
  normal: {
    padding: '20px 22px',
    background: 'var(--glass-surface-bg)',
    borderColor: 'var(--glass-surface-border)',
    labelColor: String(LABEL.color),
    titleSize: 20,
  },
};

function BriefingCard({ briefing, variant }: { briefing: MeetingBriefing; variant: CardVariant }) {
  const b = briefing.briefing || {};
  const title = briefing.summary || briefing.headline || 'Untitled meeting';
  const until = timeUntil(briefing.startTime);
  const range = formatTimeRange(briefing.startTime, briefing.endTime);
  const hasDebrief = !!b.debrief;
  const isInProgress = variant === 'inProgress';
  const vs = VARIANT_STYLE[variant];

  // A briefing the LLM couldn't fill out — no attendees, no talking points,
  // no context. Rare (a real bug upstream), but render an honest hint
  // instead of a near-empty card so the user isn't left guessing.
  const isMinimal =
    !hasDebrief &&
    !b.headline &&
    !(b.talkingPoints && b.talkingPoints.length) &&
    !(b.attendees && b.attendees.length) &&
    !(b.watchOuts && b.watchOuts.length) &&
    !b.myContext;

  // Phase 3 — recap email action state
  const [recapState, setRecapState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [recap, setRecap] = useState<RecapResponse | null>(null);

  const handleRecap = useCallback(async () => {
    setRecapState('loading');
    try {
      const result = await createMeetingRecap(briefing.id);
      if (result.success) {
        setRecap(result);
        setRecapState('done');
      } else {
        setRecap(result);
        setRecapState('error');
      }
    } catch {
      setRecapState('error');
    }
  }, [briefing.id]);

  return (
    <div
      data-testid="briefing-card"
      data-variant={variant}
      style={{
        ...GLASS,
        padding: vs.padding,
        background: vs.background,
        borderColor: vs.borderColor,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          {(until || isInProgress) && (
            <p
              className="flex items-center gap-1.5"
              style={{ ...LABEL, color: vs.labelColor, marginBottom: 6 }}
            >
              {isInProgress && (
                <span
                  aria-hidden
                  className="inline-block rounded-full animate-pulse"
                  style={{ width: 6, height: 6, background: 'rgba(110,210,160,0.95)' }}
                />
              )}
              {isInProgress ? 'Happening now' : until}
            </p>
          )}
          <h2
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: vs.titleSize,
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

      {/* In-progress: a prominent join button — the one action that matters
          while the meeting is live. Solo appointments have no URL to join. */}
      {isInProgress && briefing.meetingUrl && (
        <a
          href={briefing.meetingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[100px] mb-4 transition-transform active:scale-[0.98]"
          style={{
            background: 'rgba(52,168,110,0.95)',
            color: '#0a1a12',
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <ExternalLink className="w-3.5 h-3.5" /> Join meeting
        </a>
      )}

      {/* Debrief-pending: the meeting just ended, the debrief cron will pick
          it up within ~30 min. Tells the user a debrief is on the way instead
          of leaving a stale prep card with no signal. */}
      {briefing.debriefPending && (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-4"
          style={{
            background: 'rgba(93,92,174,0.14)',
            border: '1px solid rgba(93,92,174,0.30)',
          }}
        >
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'rgba(165,164,224,0.95)' }} />
          <span
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 11.5,
              fontWeight: 500,
              color: 'rgba(165,164,224,0.95)',
            }}
          >
            Debrief on the way — the twin is processing
          </span>
        </div>
      )}

      {/* Minimal briefing — the twin couldn't find enough context. Honest
          hint beats a near-empty card. */}
      {isMinimal && (
        <p
          className="mb-4"
          style={{
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 12.5,
            color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}
        >
          The twin couldn't find enough context for a full briefing —
          try "Refresh" closer to the start time, or open the meeting to check the details.
        </p>
      )}

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
          What the twin prepped beforehand
        </p>
      )}

      {/* Attendees */}
      {b.attendees && b.attendees.length > 0 && (
        <div className="mb-4">
          <p style={{ ...LABEL, marginBottom: 8 }}>
            <Users className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> Who's in the room
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
                    Last touchpoint: {a.lastTouchpoint}
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
            <Sparkles className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> Talking points
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
            <AlertCircle className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> Watch out for
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
          <p style={{ ...LABEL, marginBottom: 6 }}>What you bring</p>
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

      {/* Action row */}
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
            <Calendar className="w-3 h-3" /> Open meeting
          </a>
        )}

        {/* Recap email — enabled once the meeting has a debrief */}
        <button
          type="button"
          onClick={handleRecap}
          disabled={!hasDebrief || recapState === 'loading'}
          title={hasDebrief
            ? 'The twin drafts a recap email from the debrief'
            : 'Available once the post-meeting debrief is generated'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[100px] transition-colors disabled:opacity-40"
          style={{
            background: hasDebrief ? 'rgba(193,126,44,0.14)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${hasDebrief ? 'rgba(193,126,44,0.30)' : 'rgba(255,255,255,0.10)'}`,
            color: hasDebrief ? 'rgba(232,160,80,0.95)' : 'rgba(255,255,255,0.65)',
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            cursor: hasDebrief && recapState !== 'loading' ? 'pointer' : 'default',
          }}
        >
          {recapState === 'loading'
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Drafting…</>
            : recapState === 'done'
              ? <><Check className="w-3 h-3" /> Recap ready</>
              : <><Mail className="w-3 h-3" /> Email recap</>}
        </button>

        {/* Follow-up — pre-filled Google Calendar create form, client-side */}
        <a
          href={buildFollowUpUrl(briefing)}
          target="_blank"
          rel="noreferrer"
          title="Opens Google Calendar with title and guests pre-filled — you pick the time"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[100px] transition-colors"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.75)',
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <CalendarPlus className="w-3 h-3" /> Schedule follow-up
        </a>
      </div>

      {/* Recap preview — appears after the twin drafts the email */}
      {(recapState === 'done' || recapState === 'error') && recap && (
        <div
          className="mt-4 p-4 rounded-[14px]"
          style={{
            background: recapState === 'error'
              ? 'rgba(220,38,38,0.06)'
              : 'rgba(193,126,44,0.06)',
            border: `1px solid ${recapState === 'error' ? 'rgba(220,38,38,0.20)' : 'rgba(193,126,44,0.20)'}`,
          }}
        >
          {recapState === 'error' ? (
            <p
              style={{
                fontFamily: "'Geist', 'Inter', sans-serif",
                fontSize: 13,
                color: 'rgba(254,202,202,0.95)',
                lineHeight: 1.4,
              }}
            >
              {recap.error || 'Could not generate the recap.'}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p style={{ ...LABEL, color: 'rgba(232,160,80,0.85)' }}>
                  <Mail className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> The twin's draft
                </p>
                {recap.gmailUrl && (
                  <a
                    href={recap.gmailUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 transition-opacity hover:opacity-70"
                    style={{
                      fontFamily: "'Geist', 'Inter', sans-serif",
                      fontSize: 11.5,
                      fontWeight: 500,
                      color: 'rgba(232,160,80,0.95)',
                    }}
                  >
                    Open in Gmail <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {recap.to && (
                <p
                  style={{
                    fontFamily: "'Geist', 'Inter', sans-serif",
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.50)',
                    marginBottom: 4,
                  }}
                >
                  To: {recap.to}
                </p>
              )}
              <p
                style={{
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  marginBottom: 8,
                }}
              >
                {recap.subject}
              </p>
              <pre
                style={{
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.78)',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                }}
              >
                {recap.body}
              </pre>
              {recap.note && (
                <p
                  style={{
                    fontFamily: "'Geist', 'Inter', sans-serif",
                    fontSize: 11.5,
                    color: 'rgba(255,255,255,0.45)',
                    marginTop: 8,
                    fontStyle: 'italic',
                  }}
                >
                  {recap.note}
                </p>
              )}
            </>
          )}
        </div>
      )}
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
        No meetings here yet
      </p>
      <p
        style={{
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontSize: 13,
          color: 'rgba(255,255,255,0.45)',
          lineHeight: 1.6,
        }}
      >
        When you have meetings on Google Calendar with external guests,<br />
        the twin generates a briefing here automatically — an hour ahead you know who's who,<br />
        what to say, and what to avoid.
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
  useDocumentTitle('Meetings');

  const [inProgress, setInProgress] = useState<MeetingBriefing[]>([]);
  const [upcoming, setUpcoming] = useState<MeetingBriefing[]>([]);
  const [recent, setRecent] = useState<MeetingBriefing[]>([]);
  const [undated, setUndated] = useState<MeetingBriefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMeetingBriefings(signal);
      if (!res.success) {
        setError(res.error || 'Failed to load briefings');
        return;
      }
      setInProgress(res.inProgress || []);
      setUpcoming(res.upcoming || []);
      setRecent(res.recent || []);
      setUndated(res.undated || []);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      if (!signal?.aborted) setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // The scan note is a transient confirmation — auto-clear it after a few
  // seconds so it doesn't linger as stale UI until the next scan.
  useEffect(() => {
    if (!scanNote) return;
    const t = setTimeout(() => setScanNote(null), 6000);
    return () => clearTimeout(t);
  }, [scanNote]);

  // "Refresh" — scan the calendar now, then reload the list.
  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanNote(null);
    try {
      const res = await scanMeetings();
      if (!res.success) {
        setScanNote(res.error || 'Could not scan the calendar');
        return;
      }
      const generated = res.briefingsGenerated ?? 0;
      const scanned = res.scanned ?? 0;
      const deferred = res.deferred ?? 0;
      const base = generated > 0
        ? `${generated} new ${generated === 1 ? 'meeting' : 'meetings'} prepped`
        : scanned > 0
          ? `${scanned} ${scanned === 1 ? 'meeting was' : 'meetings were'} already up to date`
          : 'No meetings in the next 26h';
      setScanNote(
        deferred > 0
          ? `${base} · ${deferred} ${deferred === 1 ? 'meeting' : 'meetings'} left for automatic prep`
          : base,
      );
      await load();
    } catch {
      setScanNote('Error scanning the calendar');
    } finally {
      setScanning(false);
    }
  }, [load]);

  const hasAny = inProgress.length + upcoming.length + recent.length + undated.length > 0;
  const hero = useMemo(() => upcoming[0] ?? null, [upcoming]);
  const restUpcoming = useMemo(() => upcoming.slice(1), [upcoming]);

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 pb-24">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 pt-6 mb-1">
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
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[100px] transition-all duration-150 hover:opacity-70 active:scale-[0.97] disabled:opacity-40"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.65)',
            fontFamily: "'Geist', 'Inter', sans-serif",
            flexShrink: 0,
          }}
          title="Scans your Google Calendar now and preps the meetings in the next 26h"
        >
          <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Refresh'}
        </button>
      </div>
      {scanNote && (
        <p
          className="mb-1"
          style={{
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 12,
            color: 'rgba(255,255,255,0.50)',
          }}
        >
          {scanNote}
        </p>
      )}
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
        Your twin gets there before you. To every meeting.
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

      {/* Happening now — leads the page when a meeting is live. */}
      {!loading && inProgress.length > 0 && (
        <>
          <p style={{ ...LABEL, marginBottom: 10, color: 'rgba(110,210,160,0.95)' }}>
            Happening now · {inProgress.length}
          </p>
          <div className="space-y-4 mb-8">
            {inProgress.map((m) => (
              <BriefingCard key={m.id} briefing={m} variant="inProgress" />
            ))}
          </div>
        </>
      )}

      {!loading && hero && (
        <>
          <p style={{ ...LABEL, marginBottom: 10 }}>Next</p>
          <div className="mb-8">
            <BriefingCard briefing={hero} variant="hero" />
          </div>
        </>
      )}

      {!loading && restUpcoming.length > 0 && (
        <>
          <p style={{ ...LABEL, marginBottom: 10 }}>Coming up · {restUpcoming.length}</p>
          <div className="space-y-4 mb-8">
            {restUpcoming.map((m) => (
              <BriefingCard key={m.id} briefing={m} variant="normal" />
            ))}
          </div>
        </>
      )}

      {!loading && recent.length > 0 && (
        <>
          <p style={{ ...LABEL, marginBottom: 10 }}>
            <RefreshCw className="w-3 h-3 inline-block mr-1.5 -mt-0.5" /> Recent · {recent.length}
          </p>
          <div className="space-y-4 mb-8">
            {recent.map((m) => (
              <BriefingCard key={m.id} briefing={m} variant="normal" />
            ))}
          </div>
        </>
      )}

      {!loading && undated.length > 0 && (
        <>
          <p style={{ ...LABEL, marginBottom: 10 }}>No time set · {undated.length}</p>
          <div className="space-y-4">
            {undated.map((m) => (
              <BriefingCard key={m.id} briefing={m} variant="normal" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
