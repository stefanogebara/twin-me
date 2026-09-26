/**
 * The dependencies behind reading an attachment into the ledger: extraction, ingestion,
 * statement parsing, the LLM tier, and the two refreshes that follow a ledger change.
 * Shared byte for byte between the page's POST /chat/attach and the WhatsApp channel.
 */
import { createLogger } from '../logger.js';
import { extractReceipt, receiptToSighting } from './inbox.js';
import { extractDocumentText } from '../documentExtractionService.js';
import { complete as llmComplete, TIER_EXTRACTION } from '../llmGateway.js';
import { ingestSighting, ingestSightings, listFacts, answerQuestion, refreshRecurring, refreshReadings } from './store.js';
import { parseDelimited, parseWorkbook, toSightings, documentFingerprint } from './statements/importer.js';
import { pdfGrid } from './statements/pdfGrid.js';
import { textGrid } from './statements/shape.js';

const log = createLogger('MoneyAttachments');

export const ATTACHMENT_DEPS = {
  extractText: extractDocumentText,
  extractReceipt,
  receiptToSighting,
  ingestSighting,
  ingestSightings,
  parseStatement: (buffer, name) => toSightings(/\.(xlsx|xls)$/i.test(name) ? parseWorkbook(buffer) : parseDelimited(buffer.toString('utf8')), { document: documentFingerprint(buffer) }),
  /* A bank's PDF, read as the statement upload reads it (#597): the page's own grid, and for a
     scan the OCR text split into columns. Counted and sent on to Sources, never imported here. */
  statementFromPdf: async (buffer) => toSightings(await pdfGrid(buffer), {}),
  statementFromText: (text) => toSightings(textGrid(text), {}),
  complete: (args) => llmComplete({ tier: TIER_EXTRACTION, ...args }),
  listFacts,
  rememberNote: (userId, { subject, text }) => answerQuestion(userId, { questionId: null, kind: 'note', subject, subjectLabel: null, value: text }),
  afterLedgerChange: async (userId) => {
    await refreshRecurring(userId).catch((e) => log.warn('recurring after attachment failed', { error: e.message }));
    await refreshReadings(userId).catch((e) => log.warn('readings after attachment failed', { error: e.message }));
  },
};
