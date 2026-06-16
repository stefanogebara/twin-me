/**
 * NextMeetingCard — dashboard surfacing of the meeting-prep agent.
 *
 * Shows the single most imminent upcoming meeting's prep, compactly, right
 * on the dashboard home. This is the "twin chega antes de você" promise made
 * visible the moment you open the app — instead of being siloed on /meetings.
 *
 * Self-hiding: renders null when there's no upcoming meeting within the next
 * 24h. The card should feel earned/relevant when it appears, not like
 * permanent dashboard furniture.
 *
 * Compact by design — full briefing (attendees, watch-outs, debrief, recap
 * actions) lives on /meetings. This card shows just enough to be useful at
 * a glance + a link through.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Clock, ArrowRight, Sparkles } from 'lucide-react';
import { fetchMeetingBriefings, type MeetingBriefing } from '@/services/api/meetingBriefingsAPI';

const WITHIN_HOURS = 24; // only surface meetings starting within this window
const SOON_HOURS = 2;    // elevate visual priority when this close

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null;
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

function timeUntilLabel(iso: string | null): string {
  const h = hoursUntil(iso);
  if (h === null) return '';
  const minutes = Math.round(h * 60);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(h);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

function clockLabel(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export function NextMeetingCard() {
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<MeetingBriefing | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetchMeetingBriefings(controller.signal);
        if (!res.success) return;
        // First upcoming meeting that starts within WITHIN_HOURS.
        const imminent = (res.upcoming || []).find((m) => {
          const h = hoursUntil(m.startTime);
          return h !== null && h >= 0 && h <= WITHIN_HOURS;
        });
        if (!controller.signal.aborted) setMeeting(imminent ?? null);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        // Non-fatal — dashboard just doesn't show the card.
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, []);

  // Self-hiding: nothing to show until we have an imminent meeting.
  if (!loaded || !meeting) return null;

  const b = meeting.briefing || {};
  const title = meeting.summary || meeting.headline || 'Meeting';
  const h = hoursUntil(meeting.startTime);
  const isSoon = h !== null && h <= SOON_HOURS;
  const topPoints = (b.talkingPoints || []).slice(0, 2);

  return (
    <button
      type="button"
      // One-interface (2026-06-12): /meetings page is gone — the full prep
      // lives in conversation. Deep-link into chat with a prefilled ask.
      onClick={() => navigate('/talk-to-twin?prefill=' + encodeURIComponent('Prep me for my next meeting'))}
      className="w-full text-left rounded-[20px] px-5 py-4 backdrop-blur-[42px] transition-all duration-150 hover:opacity-95 active:scale-[0.995]"
      style={{
        background: isSoon
          ? 'linear-gradient(135deg, rgba(193,126,44,0.12) 0%, rgba(255,255,255,0.04) 70%)'
          : 'rgba(255,255,255,0.06)',
        border: `1px solid ${isSoon ? 'rgba(193,126,44,0.30)' : 'rgba(255,255,255,0.10)'}`,
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <CalendarCheck
            className="w-4 h-4"
            style={{ color: isSoon ? 'rgba(232,160,80,0.95)' : 'rgba(255,255,255,0.55)' }}
          />
          <span
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: isSoon ? 'rgba(232,160,80,0.85)' : 'rgba(255,255,255,0.45)',
            }}
          >
            Next meeting · {timeUntilLabel(meeting.startTime)}
          </span>
        </div>
        <span
          className="flex items-center gap-1"
          style={{
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 11.5,
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          <Clock className="w-3 h-3" />
          {clockLabel(meeting.startTime)}
        </span>
      </div>

      {/* Title */}
      <p
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 20,
          letterSpacing: '-0.02em',
          color: 'var(--foreground)',
          lineHeight: 1.2,
          marginBottom: topPoints.length > 0 ? 8 : 0,
        }}
      >
        {title}
      </p>

      {/* Top talking points — the "twin already prepped this" signal */}
      {topPoints.length > 0 && (
        <div className="space-y-1 mb-3">
          {topPoints.map((tp, i) => (
            <p
              key={i}
              className="pl-3 flex items-start gap-1.5"
              style={{
                fontFamily: "'Geist', 'Inter', sans-serif",
                fontSize: 12.5,
                color: 'rgba(255,255,255,0.72)',
                lineHeight: 1.45,
                borderLeft: '2px solid rgba(193,126,44,0.35)',
              }}
            >
              <Sparkles className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: 'rgba(232,160,80,0.7)' }} />
              {tp}
            </p>
          ))}
        </div>
      )}

      {/* Footer link */}
      <span
        className="inline-flex items-center gap-1"
        style={{
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 500,
          color: isSoon ? 'rgba(232,160,80,0.95)' : 'rgba(255,255,255,0.55)',
        }}
      >
        Ask your twin for the full prep <ArrowRight className="w-3 h-3" />
      </span>
    </button>
  );
}
