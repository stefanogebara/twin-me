#!/usr/bin/env node
/**
 * Diagnostic: can the meeting-prep agent actually read the test user's
 * Google Calendar? Prints token status + raw events in the next 26h +
 * which ones have external attendees (i.e. would get briefed).
 */
import dotenv from 'dotenv';
dotenv.config();

import { getValidAccessToken } from '../api/services/tokenRefreshService.js';
import { fetchUpcomingExternalEvents } from '../api/services/meetingPrep/meetingPrepService.js';

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

console.log('=== Calendar diagnostic for', USER, '===\n');

const tok = await getValidAccessToken(USER, 'google_calendar');
console.log('1. Token:', tok.success ? 'OK (valid access token)' : `FAILED — ${tok.error}`);

if (tok.success) {
  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 26 * 3600000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${tok.accessToken}` } },
  );
  console.log('2. Calendar API status:', res.status);
  if (res.ok) {
    const data = await res.json();
    const items = data.items || [];
    console.log(`3. Raw events in next 26h: ${items.length}`);
    items.slice(0, 12).forEach((e) => {
      const att = e.attendees || [];
      console.log(`   - "${e.summary || '(no title)'}" | ${e.start?.dateTime || e.start?.date} | ${att.length} attendees`);
    });
  } else {
    console.log('   body:', (await res.text()).slice(0, 400));
  }
}

console.log('\n4. fetchUpcomingExternalEvents (what the agent actually briefs):');
const events = await fetchUpcomingExternalEvents(USER);
console.log(`   ${events.length} external-attendee events would be briefed`);
events.forEach((e) => {
  console.log(`   - "${e.summary}" | ${e.start?.dateTime || e.start?.date}`);
});

process.exit(0);
