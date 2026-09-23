/**
 * What a mail's attachment does to the ledger, and with what.
 * =============================================================
 * A statement forwarded to the ledger address is the same bytes the page uploads, read by the
 * same importer; a receipt as PDF or photo is read by the same reader WhatsApp and the page's
 * attach route use (attachmentDeps.js). The one thing a mail cannot carry is the choice the page
 * makes on its form: which account the statement belongs to. With one account there is nothing
 * to choose; with several, the statement is held as a notice that Sources shows, and the person
 * uploads it there. Nothing is guessed (2026-09-23).
 *
 * Every side effect is a dependency, so the rule is tested with fakes.
 */
import { createLogger } from '../logger.js';
import { supabaseAdmin } from '../database.js';
import { acceptsAttachment, MAX_ATTACHMENT_BYTES, readAttachment } from './attachments.js';
import { ATTACHMENT_DEPS } from './attachmentDeps.js';
import { fetchReceivedAttachment, HELD_STATEMENT_KIND } from './inbox.js';
import { parseDelimited, parseWorkbook, toSightings } from './statements/importer.js';
import { statementAccounts, checkStatementEvidence } from './statements/accounts.js';
import { ingestSightings, refreshRecurring, refreshReadings } from './store.js';
import { receiptReference } from './notices.js';
import { ours, ledgerCurrency } from './currency.js';
import { quietly } from './quietly.js';

const log = createLogger('MoneyMailAttachments');

export async function saveHeldStatement(userId, { filename, rows, accounts }, { emailId, attachmentId }) {
  if (!userId || !emailId) throw new Error('Held statement owner and source id required');
  const { data, error } = await supabaseAdmin.from('money_notices').upsert({
    user_id: userId, source_ref: receiptReference(`${emailId}:${attachmentId || filename}`), kind: HELD_STATEMENT_KIND,
    merchant: null, amount: null, currency: ledgerCurrency(), due_at: null,
    evidence: { filename, rows, accounts },
  }, { onConflict: 'user_id,source_ref' }).select('id').single();
  if (error) throw new Error(`Cannot hold the statement: ${error.message}`);
  return data;
}

export const STATEMENT_DEPS = {
  statementAccounts,
  checkStatementEvidence,
  ingestSightings,
  saveHeldStatement,
  afterLedgerChange: async (userId) => {
    await refreshRecurring(userId).catch(quietly('mail/recurring-after-statement', undefined));
    await refreshReadings(userId).catch(quietly('mail/readings-after-statement', undefined));
  },
};

/**
 * A statement from a mail: imported into the one account, or held when there are several.
 * Returns { kind: 'statement', read, created } | { kind: 'held', rows } | { kind: 'nothing' }.
 */
export async function statementFromMail(userId, buffer, filename, origin, deps = STATEMENT_DEPS) {
  const rows = /\.(xlsx|xls)$/i.test(filename) ? parseWorkbook(buffer) : parseDelimited(buffer.toString('utf8'));
  const accounts = (await deps.statementAccounts(userId)).filter((a) => ours(a.currency));
  if (accounts.length !== 1) {
    const probe = toSightings(rows, {});
    if (!probe.sightings.length) return { kind: 'nothing' };
    await deps.saveHeldStatement(userId, { filename, rows: probe.sightings.length, accounts: accounts.length }, origin);
    return { kind: 'held', rows: probe.sightings.length };
  }
  const account = accounts[0];
  const { sightings } = toSightings(rows, { accountId: account.id, defaultCurrency: account.currency });
  if (!sightings.length) return { kind: 'nothing' };
  await deps.checkStatementEvidence(userId, account, sightings);
  const result = await deps.ingestSightings(userId, sightings);
  if (deps.afterLedgerChange) await deps.afterLedgerChange(userId);
  log.info('statement imported from mail', { userId, rows: sightings.length, created: result?.created ?? null });
  return { kind: 'statement', read: sightings.length, created: Number(result?.created) || 0 };
}

/** What the inbox webhook hands ingestReceivedEmail for the attachments on a mail. */
export const MAIL_ATTACHMENT_DEPS = {
  attachments: {
    accepts: acceptsAttachment,
    maxBytes: MAX_ATTACHMENT_BYTES,
    fetchAttachment: fetchReceivedAttachment,
    readStatement: (userId, buffer, filename, origin) => statementFromMail(userId, buffer, filename, origin),
    readAttachment: (userId, file) => readAttachment(userId, file, ATTACHMENT_DEPS),
  },
};
