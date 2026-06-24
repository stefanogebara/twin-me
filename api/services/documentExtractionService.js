/**
 * Document Extraction Service — tiered "read any file" layer.
 * ==========================================================
 * One entry point, `extractDocumentText`, that routes each file to the cheapest
 * tier that can actually read it. The guiding rule: NEVER OCR what you can parse.
 *
 *   text / csv         -> decode bytes (free, exact)
 *   digital PDF        -> unpdf text layer (free, exact; serverless-safe)
 *   scanned PDF        -> Mistral OCR (layout-aware, multi-page) when configured
 *   image / photo      -> vision LLM (Gemini via the gateway) — already cheap
 *   unknown            -> { ok:false }
 *
 * Structured formats (XLSX/OFX/Nubank CSV) stay with their deterministic
 * parsers in transactions/parserDispatcher.js — this service is for free-text
 * documents (papers, PDFs, notes, screenshots), returning plain text/markdown
 * that downstream extraction (resume parse, memory ingest, chat) consumes.
 *
 * Provider note: image OCR runs on the existing OPENROUTER_API_KEY (vision
 * model). The Mistral OCR tier is the upgrade for papers / dense PDFs and needs
 * its own MISTRAL_API_KEY; without it, scanned PDFs report { needsOcr:true }.
 */

import { complete } from './llmGateway.js';
import { isMistralOcrAvailable, ocrWithMistral } from './ocr/mistralOcr.js';
import { createLogger } from './logger.js';

const log = createLogger('doc-extract');

export const DOC_KIND = Object.freeze({
  TEXT: 'text',
  CSV: 'csv',
  PDF: 'pdf',
  IMAGE: 'image',
  UNKNOWN: 'unknown',
});

// Vision-capable + cheap, already in the cost registry (matches pixReceiptIngest).
const VISION_MODEL = 'google/gemini-2.5-flash';
// Below this many non-whitespace chars, treat a PDF's text layer as "scanned".
const MIN_PDF_TEXT_CHARS = 80;

const OCR_PROMPT =
  'Transcribe ALL text visible in this image exactly, preserving reading order ' +
  'and line breaks. Output only the transcribed text — no commentary, no ' +
  'markdown fences. If there is no legible text, output an empty string.';

const startsWith = (buf, bytes) =>
  Buffer.isBuffer(buf) && buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

const extOf = (filename = '') => {
  const m = /\.([a-z0-9]+)$/i.exec(String(filename).trim());
  return m ? m[1].toLowerCase() : '';
};

/**
 * Classify a file into a coarse kind from magic bytes, then mime, then
 * extension. Pure and side-effect free.
 * @returns {string} one of DOC_KIND.*
 */
export function detectDocKind(buffer, { filename = '', mimeType = '' } = {}) {
  const mt = String(mimeType).toLowerCase();
  const ext = extOf(filename);

  // 1. Magic bytes (most reliable).
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return DOC_KIND.PDF; // %PDF
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return DOC_KIND.IMAGE; // PNG
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return DOC_KIND.IMAGE; // JPEG
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return DOC_KIND.IMAGE; // GIF8
  // WEBP: 'RIFF'....'WEBP'
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.length >= 12 &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP') return DOC_KIND.IMAGE;

  // 2. MIME type.
  if (mt === 'application/pdf') return DOC_KIND.PDF;
  if (mt.startsWith('image/')) return DOC_KIND.IMAGE;
  if (mt === 'text/csv' || mt === 'text/tab-separated-values') return DOC_KIND.CSV;
  if (mt === 'text/plain' || mt === 'text/markdown') return DOC_KIND.TEXT;

  // 3. Extension.
  if (ext === 'pdf') return DOC_KIND.PDF;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic'].includes(ext)) return DOC_KIND.IMAGE;
  if (['csv', 'tsv'].includes(ext)) return DOC_KIND.CSV;
  if (['txt', 'md', 'markdown', 'text', 'log'].includes(ext)) return DOC_KIND.TEXT;

  // 4. Heuristic: mostly-printable bytes => treat as text.
  if (Buffer.isBuffer(buffer) && buffer.length > 0) {
    const sample = buffer.slice(0, 512);
    let printable = 0;
    for (const b of sample) {
      if (b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126) || b >= 160) printable++;
    }
    if (printable / sample.length > 0.85) return DOC_KIND.TEXT;
  }

  return DOC_KIND.UNKNOWN;
}

/** Pull the embedded text layer from a digital PDF via unpdf (serverless-safe). */
async function extractPdfTextLayer(buffer) {
  // Lazy import keeps unpdf (and its bundled pdf.js) out of cold-start paths
  // that never touch PDFs.
  const { extractText, getDocumentProxy } = await import('unpdf');
  const proxy = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(proxy, { mergePages: true });
  const merged = Array.isArray(text) ? text.join('\n\n') : String(text || '');
  return { text: merged, pages: totalPages || 0 };
}

/** OCR an image with the vision LLM (OpenRouter key). */
async function extractImageWithVision(buffer, mimeType, userId) {
  const mime = mimeType && /^image\//i.test(mimeType) ? mimeType : 'image/jpeg';
  const result = await complete({
    modelOverride: VISION_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: OCR_PROMPT },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` } },
      ],
    }],
    maxTokens: 4000,
    temperature: 0,
    userId,
    serviceName: 'document-ocr-vision',
    skipCache: true,
  });
  return String(result?.content || '').trim();
}

/**
 * Read a document into plain text/markdown. Never throws.
 *
 * @param {Buffer} buffer
 * @param {object} [opts]
 * @param {string} [opts.filename]
 * @param {string} [opts.mimeType]
 * @param {string} [opts.userId]
 * @param {boolean} [opts.allowOcr=true]  set false to skip any model/OCR call
 * @returns {Promise<{
 *   ok: boolean, kind: string, method: string, text: string,
 *   chars: number, pages?: number, needsOcr?: boolean, error?: string
 * }>}
 */
export async function extractDocumentText(buffer, opts = {}) {
  const { filename = '', mimeType = '', userId = null, allowOcr = true } = opts;
  const kind = detectDocKind(buffer, { filename, mimeType });
  const fail = (extra) => ({ ok: false, kind, method: 'none', text: '', chars: 0, ...extra });

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return fail({ error: 'empty buffer' });
  }

  try {
    if (kind === DOC_KIND.TEXT || kind === DOC_KIND.CSV) {
      const text = buffer.toString('utf-8');
      return { ok: true, kind, method: 'text-decode', text, chars: text.length };
    }

    if (kind === DOC_KIND.PDF) {
      let layer = { text: '', pages: 0 };
      try {
        layer = await extractPdfTextLayer(buffer);
      } catch (err) {
        log.warn(`pdf text-layer extraction failed: ${err.message}`);
      }
      const trimmedLen = layer.text.replace(/\s/g, '').length;
      if (trimmedLen >= MIN_PDF_TEXT_CHARS) {
        return { ok: true, kind, method: 'pdf-text', text: layer.text, chars: layer.text.length, pages: layer.pages };
      }
      // Scanned / image-only PDF: needs OCR.
      if (allowOcr && isMistralOcrAvailable()) {
        const ocr = await ocrWithMistral(buffer, 'application/pdf');
        if (ocr.ok && ocr.text) {
          return { ok: true, kind, method: 'mistral-ocr', text: ocr.text, chars: ocr.text.length, pages: ocr.pages };
        }
        return fail({ needsOcr: true, error: ocr.error || 'ocr returned no text' });
      }
      return fail({ needsOcr: true, error: 'scanned PDF requires OCR (set MISTRAL_API_KEY)' });
    }

    if (kind === DOC_KIND.IMAGE) {
      if (!allowOcr) return fail({ needsOcr: true, error: 'image requires OCR but allowOcr=false' });
      const text = await extractImageWithVision(buffer, mimeType, userId);
      return { ok: true, kind, method: 'vision-llm', text, chars: text.length };
    }

    return fail({ error: `unsupported document kind: ${kind}` });
  } catch (err) {
    log.error(`extractDocumentText failed (${kind}): ${err.message}`);
    return fail({ error: err.message });
  }
}
