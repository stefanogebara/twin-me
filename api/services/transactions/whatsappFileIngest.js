/**
 * WhatsApp File → Google Drive
 * ============================
 * When the user forwards a document that ISN'T a bank statement (a PDF, a
 * contract, a slide deck, any file), the twin saves it to their Google Drive
 * and replies with the link. Statements still go to the money ingest; this is
 * the catch-all "file it for me" path.
 *
 * Everything degrades to a helpful reply string — a download blip, a missing
 * Drive connection, or an upload error should read as "tell the user what to
 * try", never crash the webhook.
 */

import { downloadWhatsAppMedia } from '../whatsappService.js';
import { createFile } from '../googleWorkspaceActions.js';
import { createLogger } from '../logger.js';

const log = createLogger('whatsapp-file');

// Drive-not-connected signals from googleWorkspaceActions getAuthHeaders.
const NOT_CONNECTED_RE = /connect|not connected|no .*token|auth|unauthor|reconnect/i;

/**
 * Download a forwarded file and save it to the user's Drive. Never throws.
 * @param {string} userId
 * @param {{ id: string, filename?: string, mimeType?: string }} doc
 * @returns {Promise<{ ok: boolean, reply: string, fileId?: string }>}
 */
export async function handleFileUploadToDrive(userId, doc) {
  const buffer = await downloadWhatsAppMedia(doc?.id);
  if (!buffer) {
    return { ok: false, reply: 'I couldn\'t download that file. Mind sending it again?' };
  }

  const name = doc?.filename || `file-${new Date().toISOString().slice(0, 10)}`;
  const mimeType = doc?.mimeType || 'application/octet-stream';

  let res;
  try {
    res = await createFile(userId, { name, mimeType, buffer });
  } catch (err) {
    log.error(`drive upload threw for user ${userId}: ${err.message}`);
    return { ok: false, reply: 'I got the file but hit a problem saving it to Drive. Try again in a few minutes?' };
  }

  if (!res?.success) {
    const errStr = String(res?.error || '');
    if (NOT_CONNECTED_RE.test(errStr)) {
      return {
        ok: false,
        reply: 'To save files I need your Google Drive connected. Connect it in TwinMe settings, then send the file again.',
      };
    }
    log.warn(`drive upload failed for user ${userId}: ${errStr}`);
    return { ok: false, reply: 'I got the file but couldn\'t save it to Drive just now. Try again in a bit?' };
  }

  log.info(`file saved to Drive for user ${userId}`, { fileId: res.fileId, name: res.name });
  return {
    ok: true,
    fileId: res.fileId,
    reply: res.webViewLink
      ? `Saved "${res.name}" to your Drive.\n${res.webViewLink}`
      : `Saved "${res.name}" to your Drive.`,
  };
}
