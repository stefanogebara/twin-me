import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks for the side-effecting tiers (unpdf, Mistral OCR, vision LLM) ---
vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(async (data) => ({ __data: data })),
  extractText: vi.fn(async () => ({ text: '', totalPages: 1 })),
}));

vi.mock('../../../api/services/ocr/mistralOcr.js', () => ({
  isMistralOcrAvailable: vi.fn(() => false),
  ocrWithMistral: vi.fn(async () => ({ ok: false, error: 'not configured' })),
}));

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(async () => ({ content: '' })),
  TIER_EXTRACTION: 'extraction',
}));

import {
  detectDocKind,
  extractDocumentText,
  DOC_KIND,
} from '../../../api/services/documentExtractionService.js';
import { extractText } from 'unpdf';
import { isMistralOcrAvailable, ocrWithMistral } from '../../../api/services/ocr/mistralOcr.js';
import { complete } from '../../../api/services/llmGateway.js';

const PDF_MAGIC = Buffer.from('%PDF-1.7\n...binary...');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(() => {
  vi.clearAllMocks();
  isMistralOcrAvailable.mockReturnValue(false);
  ocrWithMistral.mockResolvedValue({ ok: false, error: 'not configured' });
  extractText.mockResolvedValue({ text: '', totalPages: 1 });
  complete.mockResolvedValue({ content: '' });
});

describe('detectDocKind', () => {
  it('detects PDF by magic bytes', () => {
    expect(detectDocKind(PDF_MAGIC, {})).toBe(DOC_KIND.PDF);
  });
  it('detects PDF by extension/mime when magic absent', () => {
    expect(detectDocKind(Buffer.from('garbage'), { filename: 'paper.pdf' })).toBe(DOC_KIND.PDF);
    expect(detectDocKind(Buffer.from('garbage'), { mimeType: 'application/pdf' })).toBe(DOC_KIND.PDF);
  });
  it('detects images by magic bytes and mime', () => {
    expect(detectDocKind(PNG_MAGIC, {})).toBe(DOC_KIND.IMAGE);
    expect(detectDocKind(JPG_MAGIC, {})).toBe(DOC_KIND.IMAGE);
    expect(detectDocKind(Buffer.from('x'), { mimeType: 'image/webp' })).toBe(DOC_KIND.IMAGE);
  });
  it('detects CSV by extension/mime', () => {
    expect(detectDocKind(Buffer.from('a,b,c'), { filename: 'data.csv' })).toBe(DOC_KIND.CSV);
    expect(detectDocKind(Buffer.from('a;b'), { mimeType: 'text/csv' })).toBe(DOC_KIND.CSV);
  });
  it('detects plain text', () => {
    expect(detectDocKind(Buffer.from('just some notes'), { filename: 'note.txt' })).toBe(DOC_KIND.TEXT);
    expect(detectDocKind(Buffer.from('hello world'), { mimeType: 'text/plain' })).toBe(DOC_KIND.TEXT);
  });
});

describe('extractDocumentText - text and csv tiers (deterministic, no network)', () => {
  it('decodes plain text without OCR or LLM', async () => {
    const res = await extractDocumentText(Buffer.from('hello world'), { filename: 'n.txt' });
    expect(res.ok).toBe(true);
    expect(res.kind).toBe(DOC_KIND.TEXT);
    expect(res.method).toBe('text-decode');
    expect(res.text).toBe('hello world');
    expect(complete).not.toHaveBeenCalled();
    expect(ocrWithMistral).not.toHaveBeenCalled();
  });

  it('returns raw CSV text for downstream parsers', async () => {
    const csv = 'date,amount\n2026-01-01,10';
    const res = await extractDocumentText(Buffer.from(csv), { filename: 'tx.csv' });
    expect(res.ok).toBe(true);
    expect(res.kind).toBe(DOC_KIND.CSV);
    expect(res.text).toBe(csv);
  });
});

describe('extractDocumentText - PDF tier', () => {
  it('uses the text layer when the PDF is digital', async () => {
    extractText.mockResolvedValue({ text: 'A'.repeat(500), totalPages: 3 });
    const res = await extractDocumentText(PDF_MAGIC, { filename: 'paper.pdf' });
    expect(res.ok).toBe(true);
    expect(res.method).toBe('pdf-text');
    expect(res.chars).toBe(500);
    expect(ocrWithMistral).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('falls back to Mistral OCR for a scanned PDF when available', async () => {
    extractText.mockResolvedValue({ text: '   ', totalPages: 2 }); // empty text layer
    isMistralOcrAvailable.mockReturnValue(true);
    ocrWithMistral.mockResolvedValue({ ok: true, text: '# Scanned page\nrecovered text', pages: 2 });
    const res = await extractDocumentText(PDF_MAGIC, { filename: 'scan.pdf' });
    expect(res.ok).toBe(true);
    expect(res.method).toBe('mistral-ocr');
    expect(res.text).toContain('recovered text');
    expect(ocrWithMistral).toHaveBeenCalledOnce();
  });

  it('reports needsOcr when scanned PDF has no OCR provider', async () => {
    extractText.mockResolvedValue({ text: '', totalPages: 1 });
    isMistralOcrAvailable.mockReturnValue(false);
    const res = await extractDocumentText(PDF_MAGIC, { filename: 'scan.pdf' });
    expect(res.ok).toBe(false);
    expect(res.needsOcr).toBe(true);
    expect(res.method).toBe('none');
  });

  it('does not call OCR when allowOcr is false', async () => {
    extractText.mockResolvedValue({ text: '', totalPages: 1 });
    isMistralOcrAvailable.mockReturnValue(true);
    const res = await extractDocumentText(PDF_MAGIC, { filename: 'scan.pdf', allowOcr: false });
    expect(res.ok).toBe(false);
    expect(res.needsOcr).toBe(true);
    expect(ocrWithMistral).not.toHaveBeenCalled();
  });
});

describe('extractDocumentText - image tier (vision LLM)', () => {
  it('reads an image via the vision model', async () => {
    complete.mockResolvedValue({ content: 'text seen in the image' });
    const res = await extractDocumentText(PNG_MAGIC, { filename: 'shot.png', userId: 'u1' });
    expect(res.ok).toBe(true);
    expect(res.kind).toBe(DOC_KIND.IMAGE);
    expect(res.method).toBe('vision-llm');
    expect(res.text).toBe('text seen in the image');
    expect(complete).toHaveBeenCalledOnce();
    // image must be passed as an image_url content part
    const arg = complete.mock.calls[0][0];
    const parts = arg.messages[0].content;
    expect(parts.some((p) => p.type === 'image_url')).toBe(true);
  });

  it('does not read images when allowOcr is false', async () => {
    const res = await extractDocumentText(PNG_MAGIC, { filename: 'shot.png', allowOcr: false });
    expect(res.ok).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('extractDocumentText - unknown', () => {
  it('returns an error for unrecognized binary', async () => {
    const res = await extractDocumentText(Buffer.from([0x00, 0x01, 0x02, 0x03]), {});
    expect(res.ok).toBe(false);
    expect(res.kind).toBe(DOC_KIND.UNKNOWN);
  });
});
