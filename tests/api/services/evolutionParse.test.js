/**
 * Evolution API messages.upsert -> normalized inbound shape. Pins JID→phone,
 * conversation vs extendedTextMessage, media id encoding (evolution:<id>), and
 * the guards that drop own/group/non-message callbacks.
 */

import { describe, it, expect } from 'vitest';
import { parseEvolutionMessage } from '../../../api/services/evolutionParse.js';

const base = (msg, over = {}) => ({
  event: 'messages.upsert',
  instance: 'twinme',
  data: { key: { remoteJid: '5511999002121@s.whatsapp.net', fromMe: false, id: 'MID1' }, pushName: 'Stefano', message: msg, ...over },
});

describe('parseEvolutionMessage', () => {
  it('parses a plain conversation text', () => {
    const r = parseEvolutionMessage(base({ conversation: 'oi twin' }));
    expect(r).toEqual({ phone: '5511999002121', text: 'oi twin', messageId: 'MID1', contactName: 'Stefano', format: 'evolution_text' });
  });

  it('parses extendedTextMessage text', () => {
    const r = parseEvolutionMessage(base({ extendedTextMessage: { text: 'gastei 80 no ifood' } }));
    expect(r.text).toBe('gastei 80 no ifood');
    expect(r.format).toBe('evolution_text');
  });

  it('encodes a document as evolution:<messageId>', () => {
    const r = parseEvolutionMessage(base({ documentMessage: { fileName: 'extrato.ofx', mimetype: 'application/x-ofx' } }));
    expect(r.document).toEqual({ id: 'evolution:MID1', filename: 'extrato.ofx', mimeType: 'application/x-ofx' });
    expect(r.format).toBe('evolution_document');
  });

  it('encodes an image as evolution:<messageId> with caption', () => {
    const r = parseEvolutionMessage(base({ imageMessage: { mimetype: 'image/jpeg', caption: 'paguei' } }));
    expect(r.image).toEqual({ id: 'evolution:MID1', mimeType: 'image/jpeg', caption: 'paguei' });
    expect(r.format).toBe('evolution_image');
  });

  it('handles data delivered as a one-element array', () => {
    const body = base({ conversation: 'hi' });
    const r = parseEvolutionMessage({ ...body, data: [body.data] });
    expect(r.text).toBe('hi');
  });

  it('drops own messages (fromMe)', () => {
    expect(parseEvolutionMessage(base({ conversation: 'echo' }, { key: { remoteJid: '5511@s.whatsapp.net', fromMe: true, id: 'x' } }))).toBe(null);
  });

  it('drops group messages (@g.us)', () => {
    expect(parseEvolutionMessage(base({ conversation: 'group' }, { key: { remoteJid: '12036304@g.us', fromMe: false, id: 'x' } }))).toBe(null);
  });

  it('drops non messages.upsert events', () => {
    expect(parseEvolutionMessage({ event: 'connection.update', data: {} })).toBe(null);
  });

  it('returns null when no recognizable content', () => {
    expect(parseEvolutionMessage(base({}))).toBe(null);
    expect(parseEvolutionMessage(null)).toBe(null);
  });
});
