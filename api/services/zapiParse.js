/**
 * Z-API webhook body -> normalized inbound shape (pure, no deps).
 * ===============================================================
 * Kept separate from the route so it's unit-testable without dragging in the
 * whole inbound pipeline. Returns null for anything not worth processing:
 * own messages (fromMe), groups, status/presence callbacks, unsupported types.
 *
 * Media (image/document) arrives as a direct URL; that URL is passed through as
 * `id` so downloadWhatsAppMedia can GET it.
 */
export function parseZapiMessage(body) {
  if (!body || body.fromMe === true || body.isGroup === true) return null;
  // Only inbound message callbacks carry content. status/presence/delivery
  // callbacks have other `type`s and no text/image/document.
  if (body.type && body.type !== 'ReceivedCallback') return null;

  const phone = body.phone;
  if (!phone) return null;
  const messageId = body.messageId || body.id || null;
  const contactName = body.senderName || body.chatName || null;

  if (body.text?.message) {
    return { phone, text: body.text.message, messageId, contactName, format: 'zapi_text' };
  }

  if (body.document?.documentUrl) {
    return {
      phone,
      text: null,
      document: {
        id: body.document.documentUrl,
        filename: body.document.fileName || body.document.title || null,
        mimeType: body.document.mimeType || null,
      },
      messageId,
      contactName,
      format: 'zapi_document',
    };
  }

  if (body.image?.imageUrl) {
    return {
      phone,
      text: null,
      image: {
        id: body.image.imageUrl,
        mimeType: body.image.mimeType || null,
        caption: body.image.caption || null,
      },
      messageId,
      contactName,
      format: 'zapi_image',
    };
  }

  return null;
}
