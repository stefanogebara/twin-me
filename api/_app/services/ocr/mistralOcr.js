/**
 * Mistral OCR client — the "papers & dense multi-page PDF" tier.
 * ==============================================================
 * Mistral's dedicated document-AI endpoint (mistral-ocr-latest) returns
 * layout-aware markdown for PDFs and images, handles multi-page natively (no
 * rasterization needed), and is cheap (~$1 / 1000 pages). It is NOT reachable
 * through OpenRouter — OpenRouter is a chat-completions router, OCR is a
 * different API shape — so this tier needs its own MISTRAL_API_KEY.
 *
 * Read-only against Mistral; never throws (returns { ok:false } on any failure
 * so the caller can fall back or report needsOcr). When no key is set the tier
 * is simply unavailable and the extractor degrades to text-layer / vision.
 *
 * Docs: https://docs.mistral.ai/capabilities/OCR/basic_ocr/
 */

import axios from 'axios';
import { createLogger } from '../logger.js';

const log = createLogger('mistral-ocr');

const OCR_ENDPOINT = 'https://api.mistral.ai/v1/ocr';
const OCR_MODEL = 'mistral-ocr-latest';

/** True when a Mistral key is configured — gate the OCR tier on this. */
export function isMistralOcrAvailable() {
  return !!process.env.MISTRAL_API_KEY?.trim();
}

/**
 * OCR a document (PDF or image) via Mistral. Never throws.
 *
 * @param {Buffer} buffer            raw file bytes
 * @param {string} [mimeType]        e.g. 'application/pdf', 'image/png'
 * @returns {Promise<{ ok: boolean, text?: string, pages?: number, error?: string }>}
 */
export async function ocrWithMistral(buffer, mimeType = 'application/pdf') {
  const key = process.env.MISTRAL_API_KEY?.trim();
  if (!key) return { ok: false, error: 'MISTRAL_API_KEY not set' };
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, error: 'empty buffer' };
  }

  const b64 = buffer.toString('base64');
  const isImage = /^image\//i.test(mimeType);
  // Mistral accepts a base64 data URI as the document/image source.
  const document = isImage
    ? { type: 'image_url', image_url: `data:${mimeType};base64,${b64}` }
    : { type: 'document_url', document_url: `data:application/pdf;base64,${b64}` };

  try {
    const { data } = await axios.post(
      OCR_ENDPOINT,
      { model: OCR_MODEL, document, include_image_base64: false },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 60000,
        maxBodyLength: Infinity,
      },
    );
    const pages = Array.isArray(data?.pages) ? data.pages : [];
    const text = pages.map((p) => p?.markdown || '').join('\n\n').trim();
    return { ok: true, text, pages: pages.length };
  } catch (err) {
    const status = err.response?.status;
    log.warn(`mistral ocr failed (${status || 'no-status'}): ${err.message}`);
    return { ok: false, error: err.response?.data?.message || err.message, status };
  }
}
