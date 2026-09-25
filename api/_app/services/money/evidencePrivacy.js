/**
 * Hide card identifiers when bank evidence is presented to a person. Keep the
 * original sighting in storage for reconciliation; this is not an ingestion edit.
 * Deliberately requires a card label: arbitrary long references, contracts and
 * account numbers must not silently become "cards". This is not general PII removal.
 */
const CARD_LABEL = String.raw`\b(?:tarjeta|tarj\.?|(?:(?:credit|debit)\s+)?card|cart[aã]o)\s*(?:(?:number|no\.?|n[º°])\s*)?[:#]?\s*`;
const CARD_NUMBER = String.raw`(?:[\d*xX]{4}(?:[ -][\d*xX]{4}){3}(?:[ -][\d*xX]{3})?|\d{4}[ -]\d{6}[ -]\d{5}|[\d*xX]{5,19})`;
const LABELLED_CARD = new RegExp(`(${CARD_LABEL})(${CARD_NUMBER})(?![\\dA-Za-z])`, 'gi');

export function maskEvidenceCards(text) {
  if (typeof text !== 'string') return text;
  return text.replace(LABELLED_CARD, (whole, label, identifier) => {
    const digits = identifier.replace(/\D/g, '');
    // Already masked last-four references remain exactly as supplied by the bank.
    if (digits.length <= 4 || !/\d{4}$/.test(identifier)) return whole;
    return `${label}****${digits.slice(-4)}`;
  });
}
