/**
 * Tests for shouldPrepEvent (api/services/meetingPrep/eventPrepFilter.js).
 *
 * replan-2026-06-10 Track B: meeting prep briefed attendee-less personal
 * events (tennis got talking points, a gym session got corporate-analyst
 * advice) and the agent's own self-created calendar blocks ("Deep Work:
 * Review feat/desktop-auto-updater" — circular content loop). This pure
 * gate pins the skip rules: solo events need external stakes in the
 * title/description; agent-created events are NEVER briefed.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldPrepEvent,
  isAgentCreatedEvent,
  hasExternalStakes,
  isGenericBlock,
} from '../../../../api/services/meetingPrep/eventPrepFilter.js';

const USER = 'stefanogebara@gmail.com';

const timedEvent = (overrides = {}) => ({
  summary: 'Meeting',
  start: { dateTime: '2026-06-11T15:00:00-03:00' },
  end: { dateTime: '2026-06-11T16:00:00-03:00' },
  attendees: [],
  ...overrides,
});

describe('shouldPrepEvent', () => {
  describe('solo personal events (the tennis/therapy fix)', () => {
    it.each([
      'Tennis com amigos',
      'Therapy',
      'Gym',
      'Murilo Personal',
      'Dra Ana Academia da Mente',
      'Corte de cabelo',
    ])('skips attendee-less personal event: %s', (summary) => {
      const result = shouldPrepEvent(timedEvent({ summary }), USER);
      expect(result.prep).toBe(false);
      expect(result.reason).toBe('personal_solo_event');
    });

    it('skips a solo event whose only attendee entries are self + a room', () => {
      const event = timedEvent({
        summary: 'Quiet planning',
        attendees: [
          { email: USER, self: true, responseStatus: 'accepted' },
          { email: 'room-3a@resource.calendar.google.com', resource: true },
        ],
      });
      expect(shouldPrepEvent(event, USER)).toEqual({
        prep: false,
        reason: 'personal_solo_event',
      });
    });
  });

  describe('solo events WITH external stakes still get prep', () => {
    it.each([
      'Interview with Acme',
      'Entrevista tecnica',
      'Pitch practice for demo day',
      'Review contract terms',
      'Assinar contrato do apartamento',
      'Negotiation prep',
      'Negociacao com fornecedor',
      'Investor update call',
      'Term sheet review',
      'Proposta comercial',
    ])('preps solo event: %s', (summary) => {
      const result = shouldPrepEvent(timedEvent({ summary }), USER);
      expect(result.prep).toBe(true);
      expect(result.reason).toBe('solo_external_stakes');
    });

    it('detects stakes in the description when the title is bland', () => {
      const event = timedEvent({
        summary: 'Call at 3pm',
        description: 'Final interview round with the hiring manager',
      });
      expect(shouldPrepEvent(event, USER).prep).toBe(true);
    });
  });

  describe('agent-created events are NEVER briefed', () => {
    const agentTag = { extendedProperties: { private: { twinme_origin: 'agent' } } };

    it('skips the agent-created Deep Work block from the June audit', () => {
      const event = timedEvent({
        summary: 'Deep Work: Review feat/desktop-auto-updater',
        ...agentTag,
      });
      expect(shouldPrepEvent(event, USER)).toEqual({
        prep: false,
        reason: 'agent_created',
      });
    });

    it('skips agent-created events even when they have other attendees', () => {
      const event = timedEvent({
        summary: 'Sync with Pedro',
        attendees: [
          { email: USER, self: true },
          { email: 'pedro@acme.com.br' },
        ],
        ...agentTag,
      });
      expect(shouldPrepEvent(event, USER).prep).toBe(false);
    });

    it('skips agent-created events even with stakes keywords in the title', () => {
      const event = timedEvent({ summary: 'Pitch rehearsal', ...agentTag });
      expect(shouldPrepEvent(event, USER).prep).toBe(false);
    });

    it('isAgentCreatedEvent only matches the exact tag', () => {
      expect(isAgentCreatedEvent(timedEvent())).toBe(false);
      expect(isAgentCreatedEvent({ extendedProperties: { private: {} } })).toBe(false);
      expect(
        isAgentCreatedEvent({ extendedProperties: { private: { twinme_origin: 'agent' } } }),
      ).toBe(true);
    });
  });

  describe('multi-person meetings keep their briefings', () => {
    it('preps a meeting with a non-self attendee', () => {
      const event = timedEvent({
        summary: 'Roney catch-up',
        attendees: [
          { email: USER, self: true, responseStatus: 'accepted' },
          { email: 'roney@empresa.com.br', responseStatus: 'accepted' },
        ],
      });
      expect(shouldPrepEvent(event, USER)).toEqual({
        prep: true,
        reason: 'has_other_attendees',
      });
    });

    it('matches self by email when the self flag is missing', () => {
      const event = timedEvent({
        summary: 'Solo hold with own email listed',
        attendees: [{ email: USER, responseStatus: 'accepted' }],
      });
      expect(shouldPrepEvent(event, USER).prep).toBe(false);
    });
  });

  describe('existing skip rules still hold', () => {
    it('skips all-day events (no start.dateTime)', () => {
      const event = { summary: 'Birthday', start: { date: '2026-06-12' } };
      expect(shouldPrepEvent(event, USER)).toEqual({
        prep: false,
        reason: 'all_day_or_untimed',
      });
    });

    it('skips declined events', () => {
      const event = timedEvent({
        summary: 'Optional all-hands',
        attendees: [
          { email: USER, self: true, responseStatus: 'declined' },
          { email: 'org@empresa.com.br' },
        ],
      });
      expect(shouldPrepEvent(event, USER)).toEqual({ prep: false, reason: 'declined' });
    });

    it('skips generic calendar blocks', () => {
      for (const summary of ['Busy', 'Focus time', 'Lunch', 'OOO']) {
        expect(shouldPrepEvent(timedEvent({ summary }), USER)).toEqual({
          prep: false,
          reason: 'generic_block',
        });
      }
      expect(isGenericBlock(undefined)).toBe(true);
      expect(isGenericBlock('Tennis com amigos')).toBe(false);
    });
  });

  describe('hasExternalStakes', () => {
    it('does not fire on everyday personal titles', () => {
      for (const summary of ['Tennis', 'Almoco com a familia', 'Gym session', 'Therapy']) {
        expect(hasExternalStakes({ summary })).toBe(false);
      }
    });
  });
});
