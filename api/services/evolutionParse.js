/**
 * Evolution API v2 "messages.upsert" body -> normalized inbound shape (pure).
 * ==========================================================================
 * Kept dependency-free so it's unit-testable without the inbound pipeline.
 * Returns null for anything not worth processing: own messages (fromMe),
 * groups (@g.us), non-message events, unsupported types.
 *
 * Evolution media is NOT a direct URL — the parse encodes the media id as
 * `evolution:<messageId>` and downloadWhatsAppMedia resolves it via
 * getBase64FromMediaMessage.
 *
 * Event shape:
 *   { event: 'messages.upsert', instance, data: { key: { remoteJid, fromMe, id },
 *     pushName, message: { conversation | extendedTextMessage.text |
 *     imageMessage | documentMessage }, messageType } }
 * `data` may be a single object or a one-element array depending on config.
 */

function jidToPhone(remoteJid) {
  if (!remoteJid || typeof remoteJid !== 'string') return null;
  if (remoteJid.endsWith('@g.us')) return null; // group chat — skip
  const at = remoteJid.indexOf('@');
  const raw = at === -1 ? remoteJid : remoteJid.slice(0, at);
  const digits = raw.replace(/[^\d]/g, '');
  return digits || null;
}

export function parseEvolutionMessage(body) {
  if (!body) return null;
  if (body.event && body.event !== 'messages.upsert') return null;

  const data = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!data?.key) return null;
  if (data.key.fromMe === true) return null;

  const phone = jidToPhone(data.key.remoteJid);
  if (!phone) return null;

  const messageId = data.key.id || null;
  const contactName = data.pushName || null;
  const msg = data.message || {};

  // Text — conversation (plain) or extendedTextMessage (with context/links).
  const text = msg.conversation || msg.extendedTextMessage?.text || null;
  if (text) {
    return { phone, text, messageId, contactName, format: 'evolution_text' };
  }

  if (msg.documentMessage) {
    const d = msg.documentMessage;
    return {
      phone,
      text: null,
      document: {
        id: `evolution:${messageId}`,
        filename: d.fileName || d.title || null,
        mimeType: d.mimetype || null,
      },
      messageId,
      contactName,
      format: 'evolution_document',
    };
  }

  if (msg.imageMessage) {
    const im = msg.imageMessage;
    return {
      phone,
      text: null,
      image: {
        id: `evolution:${messageId}`,
        mimeType: im.mimetype || null,
        caption: im.caption || null,
      },
      messageId,
      contactName,
      format: 'evolution_image',
    };
  }

  return null;
}
