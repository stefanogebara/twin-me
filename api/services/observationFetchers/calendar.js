/**
 * Google Calendar observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase } from '../observationUtils.js';
import {
  localDayWindow,
  formatEventTime,
  formatDayLabel,
  hourInTimeZone,
} from './calendarDayWindow.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Google Calendar data and return natural-language observations.
 * Reuses the same API call patterns from twin-chat.js.
 */
async function fetchCalendarObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'google_calendar');
  if (!tokenResult.success || !tokenResult.accessToken) {
    // Phase 2 (2026-06-08): throw a tagged error instead of silently returning []
    // so observationIngestion records auth_failed and surfaces a Reconnect CTA
    // (matches spotify.js). Silent [] was masked as no_new_data.
    const err = new Error(tokenResult.error || 'Google Calendar token unavailable');
    err.code = tokenResult.requiresReauth ? 'AUTH_FAILED' : 'TOKEN_UNAVAILABLE';
    throw err;
  }

  try {
    const now = new Date();
    // Forward window for raw-event persistence to user_platform_data.
    // 7 days is enough for the purchase-bot's "next 4h" window to always
    // find something if it exists, and for goalTrackingService to pick up
    // upcoming commitments. Natural-language observations still use today-only.
    const forwardEnd = new Date(now.getTime() + 7 * 24 * 36e5);
    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

    // ── Fetch ALL calendars via CalendarList, then events from each ──────────
    let calendarIds = ['primary'];
    let calendarTimeZone = null;
    try {
      const calListRes = await axios.get(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=20',
        { headers, timeout: 8000 }
      );
      const calendars = calListRes.data?.items || [];
      // The user's day boundary is their calendar's, not the server's. Prefer
      // the primary calendar's zone; any owned calendar beats falling back to
      // UTC (fidelity-eval 2026-08-12 — see calendarDayWindow.js).
      calendarTimeZone =
        calendars.find(c => c.primary)?.timeZone
        || calendars.find(c => c.timeZone)?.timeZone
        || null;
      // Use owner/writer calendars only (skip read-only subscriptions like "Holidays")
      calendarIds = calendars
        .filter(c => c.accessRole === 'owner' || c.accessRole === 'writer')
        .slice(0, 5) // Cap at 5 calendars
        .map(c => c.id);
      if (calendarIds.length === 0) calendarIds = ['primary'];
    } catch (e) {
      log.warn('CalendarList fetch failed, falling back to primary', { error: e.message });
    }

    // The observation window is the user's WHOLE local day — not `now` forward.
    // With timeMin: now, an evening run saw only the events still to come, so a
    // three-meeting day was written to the memory stream as "completely open
    // day for time management" (fidelity-eval 2026-08-12, BATTERY v3).
    const dayWindow = localDayWindow(now, calendarTimeZone);
    const { timeMin: dayStart, timeMax: dayEnd, dayKey, timeZone: tz } = dayWindow;
    const dayLabel = formatDayLabel(dayKey);

    // Fetch the local day's events (for natural-language observations) AND a
    // 7-day forward window (for raw persistence) in parallel across all
    // calendars. The day window keeps the observation summaries tight; 7d
    // forward gives the purchase-bot + goal tracker real upcoming context.
    const fetchEventsForCalendar = (calId, timeMin, timeMax, maxResults) =>
      axios.get(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`, {
        headers,
        params: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          maxResults,
          singleEvents: true,
          orderBy: 'startTime',
        },
        timeout: 10000,
      }).catch(() => null);

    const [todayResults, forwardResults] = await Promise.all([
      // 25, not 10: the window now covers the whole day rather than the tail
      // of it, so a genuinely busy day must not be silently truncated.
      Promise.all(calendarIds.map(id => fetchEventsForCalendar(id, dayStart, dayEnd, 25))),
      Promise.all(calendarIds.map(id => fetchEventsForCalendar(id, now, forwardEnd, 50))),
    ]);

    // Merge + dedupe today's events (for observation synthesis)
    const seenIds = new Set();
    const events = [];
    for (const res of todayResults) {
      for (const e of (res?.data?.items || [])) {
        if (e.id && !seenIds.has(e.id)) {
          seenIds.add(e.id);
          events.push(e);
        }
      }
    }

    // Merge + dedupe forward-window events (for raw persistence)
    const forwardSeen = new Set();
    const forwardEvents = [];
    for (const res of forwardResults) {
      for (const e of (res?.data?.items || [])) {
        if (e.id && !forwardSeen.has(e.id)) {
          forwardSeen.add(e.id);
          forwardEvents.push(e);
        }
      }
    }

    // Persist raw forward-window events to user_platform_data so downstream
    // readers (purchaseContextBuilder, goalTrackingService) have fresh data.
    // Source-url is keyed by ISO HOUR (not day) so intraday rescheduling
    // doesn't overwrite the previous snapshot — purchaseContextBuilder reads
    // the latest 30 rows and dedupes events by id, so a fresh hour-keyed row
    // adds new state without losing the prior. UNIQUE constraint on
    // (user_id, platform, data_type, source_url) means within the same hour
    // we still upsert (latest wins for the hour bucket).
    if (forwardEvents.length > 0) {
      try {
        const supabase = await getSupabase();
        if (supabase) {
          const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
          await supabase.from('user_platform_data').upsert({
            user_id: userId,
            platform: 'google_calendar',
            data_type: 'events',
            source_url: `calendar:events:${hourKey}`,
            raw_data: {
              items: forwardEvents,
              window: { from: now.toISOString(), to: forwardEnd.toISOString() },
              calendar_ids: calendarIds,
              total: forwardEvents.length,
            },
            processed: true,
          }, { onConflict: 'user_id,platform,data_type,source_url' });
        }
      } catch (storeErr) {
        log.warn('Calendar: failed to persist forward events', { error: storeErr?.message });
      }
    }
    // Sort by start time
    events.sort((a, b) => new Date(a.start?.dateTime || a.start?.date || 0) - new Date(b.start?.dateTime || b.start?.date || 0));

    // Every day-scoped observation carries the date it describes. Without it
    // the stream is N undated "today" strings and no amount of retrieval can
    // count distinct days — which is exactly how the twin lowballed "on how
    // many days did you have an event" on the v3 battery.
    for (const e of events) {
      const title = e.summary || 'Untitled event';
      const startRaw = e.start?.dateTime || e.start?.date;
      const endRaw = e.end?.dateTime || e.end?.date;

      if (startRaw && endRaw) {
        const startDate = new Date(startRaw);
        const endDate = new Date(endRaw);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;
        const startTime = formatEventTime(startDate, tz);
        const endTime = formatEventTime(endDate, tz);
        observations.push({
          content: `Has a meeting '${title}' from ${startTime} to ${endTime} on ${dayLabel}`,
          contentType: 'daily_summary',
          eventDate: dayKey,
        });
      } else if (startRaw) {
        observations.push({
          content: `Has an all-day event '${title}' on ${dayLabel}`,
          contentType: 'daily_summary',
          eventDate: dayKey,
        });
      }
    }

    if (calendarIds.length > 1) {
      observations.push({ content: `Events pulled from ${calendarIds.length} calendars (work, personal, shared)`, contentType: 'weekly_summary' });
    }

    // Detect free afternoon — use daily_summary to avoid per-hour duplicates.
    // Hours are the USER's, not the server's: getHours() on a UTC box asked
    // "is it past noon in UTC", which for a UTC-3 user was wrong for 3h a day.
    if (events.length === 0) {
      if (hourInTimeZone(now, tz) >= 12) {
        observations.push({
          content: `Free afternoon on ${dayLabel} - no meetings scheduled`,
          contentType: 'daily_summary',
          eventDate: dayKey,
        });
      }
    } else {
      const lastEventEnd = events[events.length - 1]?.end?.dateTime;
      if (lastEventEnd) {
        if (hourInTimeZone(new Date(lastEventEnd), tz) < 17) {
          observations.push({
            content: `Free afternoon on ${dayLabel} - meetings end before 5 PM`,
            contentType: 'daily_summary',
            eventDate: dayKey,
          });
        }
      }
    }

    // --- Daily calendar pattern summary ---
    // High-level observation that semantically matches pattern-level queries
    // about schedule, time management, and calendar habits.
    if (events.length > 0) {
      const timedEvents = events.filter(e => e.start?.dateTime);
      const allDayEvents = events.filter(e => e.start?.date && !e.start?.dateTime);
      const titles = events.map(e => sanitizeExternal(e.summary || 'event', 40));

      // Determine time clustering
      let timeCluster = '';
      if (timedEvents.length > 0) {
        const hours = timedEvents.map(e => hourInTimeZone(new Date(e.start.dateTime), tz));
        const avgHour = hours.reduce((a, b) => a + b, 0) / hours.length;
        timeCluster = avgHour < 12 ? 'morning-heavy' : avgHour < 17 ? 'afternoon-focused' : 'evening-loaded';
      }

      const parts = [`Calendar schedule for ${dayLabel}: ${events.length} event${events.length > 1 ? 's' : ''}`];
      if (titles.length <= 4) {
        parts.push(`(${titles.join(', ')})`);
      } else {
        parts.push(`(${titles.slice(0, 3).join(', ')} and ${titles.length - 3} more)`);
      }
      if (timeCluster) parts.push(`— ${timeCluster} scheduling`);
      if (allDayEvents.length > 0) parts.push(`with ${allDayEvents.length} all-day event${allDayEvents.length > 1 ? 's' : ''}`);

      observations.push({
        content: parts.join(' '),
        contentType: 'daily_summary',
        eventDate: dayKey,
      });
    } else {
      // Safe to assert now: the window covered the entire local day, so an
      // empty result means the day really was empty rather than merely over.
      observations.push({
        content: `Calendar schedule for ${dayLabel}: no meetings or events — completely open day for time management`,
        contentType: 'daily_summary',
        eventDate: dayKey,
      });
    }

    // Creator vs organizer analysis + conferenceData + recurrence
    if (events.length > 0) {
      let selfOrganized = 0;
      let virtualMeetings = 0;
      let recurringCount = 0;
      for (const ev of events) {
        if (ev.creator?.self && ev.organizer?.self) selfOrganized++;
        if (ev.conferenceData?.conferenceSolution) virtualMeetings++;
        if (ev.recurringEventId) recurringCount++;
      }

      if (events.length >= 3) {
        const orgPct = Math.round((selfOrganized / events.length) * 100);
        const virtualPct = Math.round((virtualMeetings / events.length) * 100);
        const recurringPct = Math.round((recurringCount / events.length) * 100);

        const styleParts = [];
        if (orgPct > 60) styleParts.push(`organized ${orgPct}% of own meetings (proactive scheduler)`);
        else if (orgPct < 30) styleParts.push(`mostly attends others' meetings (${orgPct}% self-organized)`);
        if (virtualPct > 70) styleParts.push('primarily virtual meetings');
        else if (virtualPct < 30 && events.length >= 3) styleParts.push('mostly in-person meetings');
        if (recurringPct > 50) styleParts.push(`${recurringPct}% recurring (structured routine)`);

        if (styleParts.length > 0) {
          observations.push({
            content: `Calendar work style: ${styleParts.join(', ')}`,
            contentType: 'weekly_summary',
          });
        }
      }
    }

    // Workload assessment: heavy meeting day
    if (events.length >= 5) {
      observations.push({
        content: `Heavy meeting day on ${dayLabel}: ${events.length} meetings scheduled`,
        contentType: 'daily_summary',
        eventDate: dayKey,
      });
    }

    // Back-to-back detection: events where one ends and next starts within 15 minutes
    for (let i = 0; i < events.length - 1; i++) {
      const currentEnd = events[i].end?.dateTime;
      const nextStart = events[i + 1].start?.dateTime;
      if (currentEnd && nextStart) {
        const gapMs = new Date(nextStart).getTime() - new Date(currentEnd).getTime();
        if (gapMs >= 0 && gapMs <= 15 * 60 * 1000) {
          const currentTitle = events[i].summary || 'meeting';
          const nextTitle = events[i + 1].summary || 'meeting';
          observations.push({
            content: `Back-to-back meetings on ${dayLabel}: '${currentTitle}' then '${nextTitle}' with ${Math.round(gapMs / 60000)} min gap`,
            contentType: 'current_state',
            eventDate: dayKey,
          });
        }
      }
    }
  } catch (e) {
    log.warn('Calendar error', { error: e });
  }

  // ── Focus Time + OOO blocks — deep work and boundary signals ──────────────
  // Reuse the token fetched at function entry (line 20). Three separate
  // getValidAccessToken calls used to triple cold-start latency on token
  // refresh, with no benefit — token is valid for the full request lifetime.
  try {
    const tokenResult2 = tokenResult;
    if (tokenResult2.success && tokenResult2.accessToken) {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const [focusRes, oooRes] = await Promise.all([
        axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          headers: { Authorization: `Bearer ${tokenResult2.accessToken}` },
          params: { eventTypes: 'focusTime', timeMin: weekAgo.toISOString(), timeMax: weekAhead.toISOString(), singleEvents: true, maxResults: 20 },
          timeout: 10000,
        }).catch(() => ({ data: { items: [] } })),
        axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          headers: { Authorization: `Bearer ${tokenResult2.accessToken}` },
          params: { eventTypes: 'outOfOffice', timeMin: weekAgo.toISOString(), timeMax: weekAhead.toISOString(), singleEvents: true, maxResults: 10 },
          timeout: 10000,
        }).catch(() => ({ data: { items: [] } })),
      ]);

      const focusBlocks = focusRes.data?.items || [];
      if (focusBlocks.length > 0) {
        // Calculate total focus time hours this week
        let totalFocusMs = 0;
        for (const fb of focusBlocks) {
          const start = fb.start?.dateTime ? new Date(fb.start.dateTime) : null;
          const end = fb.end?.dateTime ? new Date(fb.end.dateTime) : null;
          if (start && end) totalFocusMs += end.getTime() - start.getTime();
        }
        const focusHours = Math.round(totalFocusMs / (1000 * 60 * 60) * 10) / 10;
        observations.push({
          content: `Has ${focusBlocks.length} Focus Time block${focusBlocks.length !== 1 ? 's' : ''} scheduled this week (${focusHours} hours of deep work time)`,
          contentType: 'weekly_summary',
        });
      }

      const oooBlocks = oooRes.data?.items || [];
      if (oooBlocks.length > 0) {
        const oooTitles = oooBlocks.map(o => sanitizeExternal(o.summary || 'Out of Office', 40)).slice(0, 3);
        observations.push({
          content: `Out of office scheduled: ${oooTitles.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }

      // ── fromGmail events — passive real-world behavior (flights, restaurants, tickets) ──
      try {
        const gmailEventsRes = await axios.get(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            headers: { Authorization: `Bearer ${tokenResult2.accessToken}` },
            params: {
              eventTypes: 'fromGmail',
              timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              timeMax: weekAhead.toISOString(),
              singleEvents: true,
              maxResults: 15,
            },
            timeout: 10000,
          }
        ).catch(() => ({ data: { items: [] } }));

        const gmailEvents = gmailEventsRes.data?.items || [];
        if (gmailEvents.length > 0) {
          // Categorize by type: flights, restaurants, hotels, events/tickets, packages
          const categories = { flights: [], restaurants: [], hotels: [], events: [], other: [] };
          const flightPattern = /\b(flight|fly|airline|boarding|depart|arrive|airport)\b/i;
          const restaurantPattern = /\b(restaurant|reservation|dining|table for|brunch|dinner)\b/i;
          const hotelPattern = /\b(hotel|stay|check.?in|check.?out|booking|airbnb|hostel)\b/i;
          const eventPattern = /\b(ticket|concert|show|game|match|event|festival|theater|theatre)\b/i;

          for (const ev of gmailEvents) {
            const text = `${ev.summary || ''} ${ev.description || ''} ${ev.location || ''}`;
            if (flightPattern.test(text)) categories.flights.push(ev);
            else if (restaurantPattern.test(text)) categories.restaurants.push(ev);
            else if (hotelPattern.test(text)) categories.hotels.push(ev);
            else if (eventPattern.test(text)) categories.events.push(ev);
            else categories.other.push(ev);
          }

          const parts = [`Gmail-created calendar events (last 30 days): ${gmailEvents.length} total`];
          if (categories.flights.length > 0) parts.push(`${categories.flights.length} flights`);
          if (categories.restaurants.length > 0) parts.push(`${categories.restaurants.length} restaurant reservations`);
          if (categories.hotels.length > 0) parts.push(`${categories.hotels.length} hotel bookings`);
          if (categories.events.length > 0) parts.push(`${categories.events.length} event tickets`);

          observations.push({
            content: parts.join(', '),
            contentType: 'weekly_summary',
          });

          // Add specific items as separate observations for richer memory
          const recentTitles = gmailEvents.slice(0, 5)
            .map(ev => sanitizeExternal(ev.summary || '', 60))
            .filter(Boolean);
          if (recentTitles.length > 0) {
            observations.push({
              content: `Recent real-world activities from email: ${recentTitles.join(', ')}`,
              contentType: 'weekly_summary',
            });
          }
        }
      } catch (gmailErr) {
        log.debug('Calendar fromGmail error', { error: gmailErr?.message });
      }
    }
  } catch (e) {
    // Focus Time/OOO may not be supported on all accounts — non-critical
    log.debug('Calendar Focus Time/OOO error', { error: e?.message });
  }

  // ── CalendarList — organizational complexity signal ────────────────────────
  // Reuse the token fetched at function entry. See note above.
  try {
    const tokenResult3 = tokenResult;
    if (tokenResult3.success && tokenResult3.accessToken) {
      const calListRes = await axios.get(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=20',
        { headers: { Authorization: `Bearer ${tokenResult3.accessToken}` }, timeout: 10000 }
      );
      const calendars = calListRes.data?.items || [];
      if (calendars.length > 1) {
        const calNames = calendars
          .filter(c => !c.primary) // exclude "primary" as it's always there
          .map(c => sanitizeExternal(c.summaryOverride || c.summary || '', 40))
          .filter(Boolean)
          .slice(0, 6);
        const ownedCount = calendars.filter(c => c.accessRole === 'owner').length;
        observations.push({
          content: `Maintains ${calendars.length} calendar${calendars.length !== 1 ? 's' : ''} (${ownedCount} owned): ${calNames.join(', ')}`,
          contentType: 'weekly_summary',
        });

        // Store for feature extractor
        try {
          const supabase = await getSupabase();
          if (supabase) {
            const today = new Date().toISOString().slice(0, 10);
            await supabase.from('user_platform_data').upsert({
              user_id: userId,
              platform: 'google_calendar',
              data_type: 'calendar_list',
              source_url: `calendar:list:${today}`,
              raw_data: {
                total: calendars.length,
                calendars: calendars.map(c => ({
                  summary: c.summaryOverride || c.summary,
                  primary: c.primary || false,
                  accessRole: c.accessRole,
                  colorId: c.colorId,
                  hidden: c.hidden || false,
                  selected: c.selected,
                })),
              },
              processed: true,
            }, { onConflict: 'user_id,platform,data_type,source_url' });
          }
        } catch (storeErr) {
          log.warn('Calendar: failed to store calendar list', { error: storeErr });
        }
      }
    }
  } catch (e) {
    log.debug('Calendar list error', { error: e?.message });
  }

  return observations;
}

export default fetchCalendarObservations;
export { fetchCalendarObservations };
