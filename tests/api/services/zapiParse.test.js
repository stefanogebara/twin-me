/**
 * Z-API callback body -> normalized inbound shape. Pins the real payload
 * shapes from Z-API's on-message-received docs, plus the guards that must
 * drop own/group/status callbacks (otherwise the twin would reply to itself
 * or to group chatter).
 */

import { describe, it, expect } from 'vitest';
import { parseZapiMessage } from '../../../api/services/zapiParse.js';

describe('parseZapiMessage', () => {
  it('parses a received text message', () => {
    const r = parseZapiMessage({
      phone: '5544999999999', fromMe: false, isGroup: false,
      messageId: 'MID1', senderName: 'Stefano', type: 'ReceivedCallback',
      text: { message: 'oi twin' },
    });
    expect(r).toEqual({
      phone: '5544999999999', text: 'oi twin', messageId: 'MID1',
      contactName: 'Stefano', format: 'zapi_text',
    });
  });

  it('parses a document with the URL as id', () => {
    const r = parseZapiMessage({
      phone: '5544999999999', fromMe: false, messageId: 'MID2', type: 'ReceivedCallback',
      document: { documentUrl: 'https://m/x.ofx', fileName: 'extrato.ofx', mimeType: 'application/x-ofx' },
    });
    expect(r.document).toEqual({ id: 'https://m/x.ofx', filename: 'extrato.ofx', mimeType: 'application/x-ofx' });
    expect(r.format).toBe('zapi_document');
  });

  it('parses an image with the URL as id and the caption', () => {
    const r = parseZapiMessage({
      phone: '5544999999999', fromMe: false, messageId: 'MID3', type: 'ReceivedCallback',
      image: { imageUrl: 'https://m/x.jpg', mimeType: 'image/jpeg', caption: 'paguei' },
    });
    expect(r.image).toEqual({ id: 'https://m/x.jpg', mimeType: 'image/jpeg', caption: 'paguei' });
    expect(r.format).toBe('zapi_image');
  });

  it('drops own messages (fromMe)', () => {
    expect(parseZapiMessage({ phone: '5544', fromMe: true, text: { message: 'echo' } })).toBe(null);
  });

  it('drops group messages', () => {
    expect(parseZapiMessage({ phone: '5544', isGroup: true, text: { message: 'group chatter' } })).toBe(null);
  });

  it('drops non-message callbacks (e.g. delivery status)', () => {
    expect(parseZapiMessage({ phone: '5544', type: 'DeliveryCallback' })).toBe(null);
  });

  it('falls back from senderName to chatName for the contact name', () => {
    const r = parseZapiMessage({ phone: '5544', type: 'ReceivedCallback', chatName: 'Grupo X', text: { message: 'hi' } });
    expect(r.contactName).toBe('Grupo X');
  });

  it('returns null when there is no recognizable content', () => {
    expect(parseZapiMessage({ phone: '5544', type: 'ReceivedCallback' })).toBe(null);
    expect(parseZapiMessage(null)).toBe(null);
  });
});
