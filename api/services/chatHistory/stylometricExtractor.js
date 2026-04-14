/**
 * Stylometric Feature Extractor
 * ==============================
 * Analyzes a corpus of the user's own messages to extract writing style fingerprints.
 * Outputs fact memories stored directly into the memory stream.
 *
 * Features extracted:
 *   - Average message length (words)
 *   - Capitalization style (lowercase dominant / mixed / proper)
 *   - Punctuation habits (ends with nothing / . / ! / ? / ...)
 *   - Emoji usage (ratio + top emojis)
 *   - Characteristic n-grams (phrases you use often, tf-idf inspired)
 *   - Response density (one-liner vs multi-sentence)
 *   - Exclamation / question ratio
 *   - Language hints (non-ASCII patterns suggesting PT/ES/FR)
 *
 * Each extracted feature is stored as a `fact` memory so the personality
 * prompt builder and reflection engine can use them.
 */

import { addMemory } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('StylometricExtractor');

// ── Emoji detection ──────────────────────────────────────────────────────────

// Broad Unicode emoji range (covers most emoji blocks)
const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{FE00}-\u{FE0F}]/gu;

function extractEmojis(text) {
  return text.match(EMOJI_RE) || [];
}

// ── N-gram extraction ────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'is','was','are','were','be','been','have','has','had','do','did','does',
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their','this','that','these','those',
  'what','how','when','where','why','who',
  // Portuguese common words
  'eu','tu','ele','ela','nos','eles','elas','um','uma','o','a','os','as',
  'de','do','da','dos','das','em','no','na','nos','nas','por','para',
  'que','com','se','nao','sim','mas','ou','e','é','não',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u024F]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

function getNgrams(tokens, n) {
  const ngrams = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function topN(freq, n) {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ phrase: k, count: v }));
}

// ── Feature computation ──────────────────────────────────────────────────────

function computeFeatures(myMessages) {
  const msgs = myMessages.map(m => m.msg);
  const n = msgs.length;
  if (n === 0) return null;

  // Word counts
  const wordCounts = msgs.map(m => m.trim().split(/\s+/).filter(Boolean).length);
  const avgWords = wordCounts.reduce((a, b) => a + b, 0) / n;

  // Capitalization
  const lowercaseStart = msgs.filter(m => /^[a-z]/.test(m.trim())).length;
  const capsRatio = lowercaseStart / n;
  const capStyle = capsRatio > 0.7 ? 'lowercase-dominant' : capsRatio > 0.4 ? 'mixed' : 'proper-case';

  // Punctuation endings
  const endings = { none: 0, period: 0, exclamation: 0, question: 0, ellipsis: 0 };
  for (const m of msgs) {
    const t = m.trimEnd();
    if (t.endsWith('...') || t.endsWith('…')) endings.ellipsis++;
    else if (t.endsWith('!')) endings.exclamation++;
    else if (t.endsWith('?')) endings.question++;
    else if (t.endsWith('.')) endings.period++;
    else endings.none++;
  }

  // Emoji usage
  const emojiFreq = {};
  let msgsWithEmoji = 0;
  for (const m of msgs) {
    const emojis = extractEmojis(m);
    if (emojis.length > 0) msgsWithEmoji++;
    for (const e of emojis) {
      emojiFreq[e] = (emojiFreq[e] || 0) + 1;
    }
  }
  const emojiRatio = msgsWithEmoji / n;
  const topEmojis = Object.entries(emojiFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e]) => e);

  // Response density
  const oneLiners = msgs.filter(m => m.split(/[.!?]/).filter(Boolean).length <= 1).length;
  const oneLineRatio = oneLiners / n;

  // Characteristic phrases (bigrams + trigrams)
  const bigramFreq = {};
  const trigramFreq = {};
  for (const m of msgs) {
    const tokens = tokenize(m);
    for (const bg of getNgrams(tokens, 2)) bigramFreq[bg] = (bigramFreq[bg] || 0) + 1;
    for (const tg of getNgrams(tokens, 3)) trigramFreq[tg] = (trigramFreq[tg] || 0) + 1;
  }
  // Only keep phrases that appear 3+ times (signature phrases, not noise)
  const sigBigrams = topN(bigramFreq, 15).filter(x => x.count >= 3);
  const sigTrigrams = topN(trigramFreq, 10).filter(x => x.count >= 3);

  return {
    n,
    avgWords: Math.round(avgWords * 10) / 10,
    capStyle,
    capsRatio: Math.round(capsRatio * 100),
    endings: {
      none: Math.round(endings.none / n * 100),
      period: Math.round(endings.period / n * 100),
      exclamation: Math.round(endings.exclamation / n * 100),
      question: Math.round(endings.question / n * 100),
      ellipsis: Math.round(endings.ellipsis / n * 100),
    },
    emojiRatio: Math.round(emojiRatio * 100),
    topEmojis,
    oneLineRatio: Math.round(oneLineRatio * 100),
    sigBigrams,
    sigTrigrams,
  };
}

// ── Fact generation ──────────────────────────────────────────────────────────

function generateFacts(f, platform) {
  const facts = [];
  const src = platform === 'telegram_chat' ? 'Telegram' : 'WhatsApp';

  // Message length style
  if (f.avgWords < 5) {
    facts.push(`Tends to send very short messages when chatting — average ${f.avgWords} words per message (from ${src} history).`);
  } else if (f.avgWords < 12) {
    facts.push(`Typically sends concise messages when chatting — average ${f.avgWords} words per message (from ${src} history).`);
  } else {
    facts.push(`Tends to write longer messages when chatting — average ${f.avgWords} words per message (from ${src} history).`);
  }

  // Capitalization
  if (f.capStyle === 'lowercase-dominant') {
    facts.push(`Types almost entirely in lowercase — ${f.capsRatio}% of messages start with a lowercase letter (${src} style fingerprint).`);
  } else if (f.capStyle === 'proper-case') {
    facts.push(`Consistently capitalizes the start of messages — uses standard capitalization (${src} style fingerprint).`);
  }

  // Punctuation
  if (f.endings.none > 50) {
    facts.push(`Rarely uses punctuation at the end of chat messages — ${f.endings.none}% of messages end without a period or mark (${src} habit).`);
  }
  if (f.endings.exclamation > 20) {
    facts.push(`Frequently uses exclamation marks — ${f.endings.exclamation}% of messages end with ! (${src} enthusiasm marker).`);
  }
  if (f.endings.ellipsis > 15) {
    facts.push(`Uses ellipses frequently in chat — ${f.endings.ellipsis}% of messages end with "..." (${src} speech pattern).`);
  }

  // Emoji usage
  if (f.emojiRatio > 40) {
    const emojiStr = f.topEmojis.length > 0 ? ` Most-used: ${f.topEmojis.join(' ')}.` : '';
    facts.push(`Heavy emoji user — uses emojis in ${f.emojiRatio}% of messages.${emojiStr} (${src} pattern).`);
  } else if (f.emojiRatio > 15) {
    const emojiStr = f.topEmojis.length > 0 ? ` Favorites: ${f.topEmojis.join(' ')}.` : '';
    facts.push(`Uses emojis moderately — in about ${f.emojiRatio}% of chat messages.${emojiStr} (${src} pattern).`);
  } else if (f.emojiRatio < 5) {
    facts.push(`Rarely uses emojis in chat messages — appears in only ${f.emojiRatio}% of messages (${src} pattern).`);
  }

  // Response density
  if (f.oneLineRatio > 80) {
    facts.push(`Almost always responds with one-liners in chat — ${f.oneLineRatio}% of messages are a single sentence (${src} pattern).`);
  }

  // Signature phrases
  if (f.sigTrigrams.length > 0) {
    const phrases = f.sigTrigrams.slice(0, 5).map(x => `"${x.phrase}"`).join(', ');
    facts.push(`Characteristic phrases used repeatedly in ${src} chats: ${phrases}.`);
  } else if (f.sigBigrams.length > 0) {
    const phrases = f.sigBigrams.slice(0, 5).map(x => `"${x.phrase}"`).join(', ');
    facts.push(`Recurring word patterns from ${src} chat history: ${phrases}.`);
  }

  return facts;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract stylometric features and store as fact memories
 *
 * @param {string} userId
 * @param {{ msg: string, ts: Date }[]} myMessages - user's own messages
 * @param {string} platform - 'whatsapp_chat' | 'telegram_chat'
 * @returns {{ factsStored: number, features: object }}
 */
export async function extractAndStoreStylometrics(userId, myMessages, platform) {
  if (myMessages.length < 50) {
    log.info('Skipping stylometrics — fewer than 50 user messages', { count: myMessages.length });
    return { factsStored: 0, features: null };
  }

  const features = computeFeatures(myMessages);
  if (!features) return { factsStored: 0, features: null };

  const facts = generateFacts(features, platform);
  let factsStored = 0;

  for (const fact of facts) {
    const result = await addMemory(userId, fact, 'fact', {
      source: platform,
      category: 'stylometrics',
      extracted_at: new Date().toISOString(),
    });
    if (result) factsStored++;
  }

  log.info('Stylometrics stored', { userId, factsStored, platform, msgCount: myMessages.length });
  return { factsStored, features };
}
