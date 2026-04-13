/**
 * Chat Message Processor
 * ======================
 * Transforms raw ChatMessage[] (from any parser) into QA conversation pairs
 * ready for ingestion into the TwinMe memory stream.
 *
 * Pipeline:
 *   ChatMessage[] → filter → time-window combine → QA pair → PII strip → output
 *
 * Time-window logic (adapted from WeClone's strategy.py):
 *   1. Combine consecutive messages from the SAME sender within COMBINE_WINDOW_MS
 *      into a single turn (people often send thoughts in multiple short messages)
 *   2. Pair a "their message" turn with the next "your message" turn if they
 *      occur within QA_WINDOW_MS — this is one conversation memory
 *
 * PII stripping: regex-based removal of phone numbers, emails, credit cards,
 * IBANs. Uses the same patterns as Presidio but in pure JS (no Python dependency).
 */

// ── Config ──────────────────────────────────────────────────────────────────

const COMBINE_WINDOW_MS = 3 * 60 * 1000;   // 3 min: merge consecutive same-sender msgs
const QA_WINDOW_MS      = 10 * 60 * 1000;  // 10 min: max gap for a Q→A pair
const MIN_WORDS         = 2;               // skip very short messages ("ok", "k")
const MAX_TURN_CHARS    = 1200;            // truncate combined turns at this length
const MAX_PAIRS         = 8000;            // hard cap per import to avoid memory flood

// ── PII patterns ────────────────────────────────────────────────────────────

const PII_PATTERNS = [
  { re: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,             tag: '[phone]' },     // US/BR phone
  { re: /\b\+\d{1,3}\s?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{4}\b/g, tag: '[phone]' }, // intl phone
  { re: /\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/gi,  tag: '[email]' },
  { re: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,       tag: '[card]' },      // credit card
  { re: /\b[A-Z]{2}\d{2}[A-Z0-9]{8,30}\b/g,               tag: '[iban]' },      // IBAN
  { re: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,             tag: '[ssn]' },       // SSN
];

function stripPII(text) {
  let clean = text;
  for (const { re, tag } of PII_PATTERNS) {
    clean = clean.replace(re, tag);
  }
  return clean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function truncate(text, maxChars) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim() + '…';
}

// ── Step 1: combine consecutive same-sender messages ────────────────────────

function combineConsecutive(messages) {
  if (messages.length === 0) return [];

  const combined = [];
  let current = { ...messages[0], msg: messages[0].msg };

  for (let i = 1; i < messages.length; i++) {
    const m = messages[i];
    const sameAuthor = m.is_sender === current.is_sender;
    const withinWindow = (m.timestamp - current.timestamp) <= COMBINE_WINDOW_MS;

    if (sameAuthor && withinWindow) {
      current.msg = current.msg + ' ' + m.msg;
      // Keep the latest timestamp (end of the combined turn)
      current.timestamp = m.timestamp;
    } else {
      combined.push(current);
      current = { ...m, msg: m.msg };
    }
  }
  combined.push(current);
  return combined;
}

// ── Step 2: match Q→A pairs ──────────────────────────────────────────────────

/**
 * Walk the combined message stream and create pairs:
 * { context: <their message>, response: <your message>, ts: Date, chat_name: string }
 *
 * We look for: other→you sequences within QA_WINDOW_MS.
 * Multiple "their" messages in a row before your response are concatenated as context.
 */
function buildQAPairs(combined) {
  const pairs = [];
  let i = 0;

  while (i < combined.length && pairs.length < MAX_PAIRS) {
    const m = combined[i];

    // Look for a block of "other" messages
    if (m.is_sender === 0) {
      // Collect consecutive "other" messages as context
      const contextParts = [m.msg];
      let j = i + 1;

      while (j < combined.length && combined[j].is_sender === 0) {
        contextParts.push(combined[j].msg);
        j++;
      }

      // Next message must be mine and within window
      if (j < combined.length && combined[j].is_sender === 1) {
        const myMsg = combined[j];
        const timeDiff = myMsg.timestamp - m.timestamp;

        if (timeDiff <= QA_WINDOW_MS) {
          const context = truncate(stripPII(contextParts.join(' ')), MAX_TURN_CHARS);
          const response = truncate(stripPII(myMsg.msg), MAX_TURN_CHARS);

          if (wordCount(context) >= MIN_WORDS && wordCount(response) >= MIN_WORDS) {
            pairs.push({
              context,
              response,
              ts: myMsg.timestamp,
              chat_name: m.chat_name || myMsg.chat_name || 'Chat',
            });
          }
          i = j + 1;
          continue;
        }
      }

      i = j; // skip context block, no matching response found
    } else {
      i++;
    }
  }

  return pairs;
}

// ── Step 3: also collect standalone "my" messages for stylometrics ───────────

function collectMyMessages(combined) {
  return combined
    .filter(m => m.is_sender === 1 && wordCount(m.msg) >= MIN_WORDS)
    .map(m => ({
      msg: stripPII(m.msg),
      ts: m.timestamp,
      chat_name: m.chat_name,
    }));
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Process raw ChatMessage[] into conversation pairs + my messages for stylometrics
 *
 * @param {ChatMessage[]} messages - From whatsappParser or telegramParser
 * @returns {{ pairs: QAPair[], myMessages: MyMessage[], stats: object }}
 */
export function processMessages(messages) {
  // Sort by timestamp (exports are usually ordered but be safe)
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  const combined = combineConsecutive(sorted);
  const pairs = buildQAPairs(combined);
  const myMessages = collectMyMessages(combined);

  const stats = {
    raw_messages: messages.length,
    combined_turns: combined.length,
    qa_pairs: pairs.length,
    my_messages: myMessages.length,
    capped: pairs.length >= MAX_PAIRS,
  };

  return { pairs, myMessages, stats };
}
