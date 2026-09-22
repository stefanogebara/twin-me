/**
 * Calendar and Gmail over plain HTTP, in place of the 31,4 MB `googleapis` package
 * (2026-09-22). The shapes must match what the client library returned, because five call
 * sites kept their bodies: `{ data }`, and an error carrying the HTTP status as `code`.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));

const { calendarClient, gmailClient, toQuery, CALENDAR_BASE, GMAIL_BASE } = await import('../../../api/services/google/api.js');

const ok = (body) => vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }));
const fails = (status, message) => vi.fn(async () => ({ ok: false, status, text: async () => JSON.stringify({ error: { message } }) }));
const urlOf = (fetchImpl) => new URL(fetchImpl.mock.calls[0][0]);

describe('the query Google expects', () => {
  it('repeats a list rather than joining it, and drops what is empty', () => {
    const q = toQuery({ labelIds: ['INBOX', 'UNREAD'], maxResults: 5, singleEvents: true, q: '', missing: null, gone: undefined });
    expect(q.getAll('labelIds')).toEqual(['INBOX', 'UNREAD']);
    expect(q.get('maxResults')).toBe('5');
    expect(q.get('singleEvents')).toBe('true');
    expect([...q.keys()]).toEqual(['labelIds', 'labelIds', 'maxResults', 'singleEvents']);
  });
});

describe('the calendar', () => {
  it('lists a calendar\'s events at the path the API uses, with the bearer token', async () => {
    const fetchImpl = ok({ items: [{ id: 'e1', summary: 'Class' }] });
    const res = await calendarClient('tok', { fetchImpl }).events.list({
      calendarId: 'primary', timeMin: '2026-09-22T00:00:00Z', timeMax: '2026-09-23T00:00:00Z', maxResults: 8, singleEvents: true, orderBy: 'startTime',
    });
    expect(res.data.items).toHaveLength(1);
    const url = urlOf(fetchImpl);
    expect(`${url.origin}${url.pathname}`).toBe(`${CALENDAR_BASE}/calendars/primary/events`);
    expect(url.searchParams.get('orderBy')).toBe('startTime');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('escapes a calendar id that is an address', async () => {
    const fetchImpl = ok({ items: [] });
    await calendarClient('tok', { fetchImpl }).events.list({ calendarId: 'a b@group.calendar.google.com' });
    expect(urlOf(fetchImpl).pathname).toBe('/calendar/v3/calendars/a%20b%40group.calendar.google.com/events');
  });

  it('lists the calendars a person has', async () => {
    const fetchImpl = ok({ items: [{ id: 'primary' }, { id: 'other' }] });
    const res = await calendarClient('tok', { fetchImpl }).calendarList.list();
    expect(res.data.items).toHaveLength(2);
    expect(urlOf(fetchImpl).pathname).toBe('/calendar/v3/users/me/calendarList');
  });
});

describe('gmail', () => {
  it('lists and reads a message at the paths the API uses', async () => {
    const list = ok({ messages: [{ id: 'm1' }] });
    await gmailClient('tok', { fetchImpl: list }).users.messages.list({ userId: 'me', maxResults: 5, labelIds: ['INBOX'], q: 'is:unread' });
    expect(`${urlOf(list).origin}${urlOf(list).pathname}`).toBe(`${GMAIL_BASE}/users/me/messages`);
    expect(urlOf(list).searchParams.get('q')).toBe('is:unread');

    const one = ok({ threadId: 't1', snippet: 'hello', payload: { headers: [{ name: 'Subject', value: 'Hi' }] } });
    const res = await gmailClient('tok', { fetchImpl: one }).users.messages.get({ userId: 'me', id: 'm1', format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] });
    expect(res.data.payload.headers[0].value).toBe('Hi');
    expect(urlOf(one).pathname).toBe('/gmail/v1/users/me/messages/m1');
    expect(urlOf(one).searchParams.getAll('metadataHeaders')).toEqual(['Subject', 'From', 'Date']);
  });
});

describe('a failure', () => {
  it('throws with the status as code, which is what tells a dead token from a fault', async () => {
    const fetchImpl = fails(401, 'Invalid Credentials');
    await expect(calendarClient('tok', { fetchImpl }).calendarList.list()).rejects.toMatchObject({ code: 401, status: 401, message: 'Invalid Credentials' });
  });

  it('refuses to call without a token rather than asking Google anonymously', async () => {
    const fetchImpl = ok({});
    await expect(calendarClient('', { fetchImpl }).calendarList.list()).rejects.toThrow(/access token/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
