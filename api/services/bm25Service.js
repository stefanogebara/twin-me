/**
 * BM25 Lexical Scoring — TiMem-inspired (arXiv 2601.02845)
 * =========================================================
 * Pure BM25 scoring for lexical retrieval alongside semantic vector search.
 * Catches exact named entities, dates, and precise phrases that cosine
 * similarity over dense embeddings misses.
 *
 * Zero dependencies. All functions are pure.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'like',
  'through', 'after', 'over', 'between', 'out', 'up', 'down', 'off',
  'and', 'but', 'or', 'nor', 'not', 'no', 'so', 'if', 'then', 'than',
  'too', 'very', 'just', 'also', 'that', 'this', 'these', 'those',
  'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which',
  'who', 'whom', 'how', 'when', 'where', 'why',
]);

/**
 * Extract keywords from text: lowercase, split on whitespace/punctuation,
 * filter stopwords, deduplicate.
 * @param {string} text
 * @returns {string[]}
 */
export function extractKeywords(text) {
  if (!text) return [];
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s'-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w))
  )];
}

/**
 * Compute term frequency for each term in a document.
 * @param {string} doc - Document text (lowercased)
 * @returns {Map<string, number>}
 */
function termFrequency(doc) {
  const tf = new Map();
  const tokens = doc.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

/**
 * BM25 scoring for a batch of documents against a query.
 *
 * BM25(q, d) = sum over terms t in q of:
 *   IDF(t) * (tf(t,d) * (k1 + 1)) / (tf(t,d) + k1 * (1 - b + b * |d| / avgdl))
 *
 * @param {string} query - User query text
 * @param {string[]} documents - Array of document strings
 * @param {object} [params] - { k1: 1.5, b: 0.75 }
 * @returns {number[]} BM25 scores per document (higher = better match)
 */
export function bm25ScoreBatch(query, documents, params = {}) {
  const { k1 = 1.5, b = 0.75 } = params;
  const n = documents.length;
  if (n === 0) return [];

  const queryTerms = extractKeywords(query);
  if (queryTerms.length === 0) return new Array(n).fill(0);

  // Precompute document TFs and lengths
  const docTFs = documents.map(d => termFrequency(d || ''));
  const docLengths = documents.map(d => (d || '').split(/\s+/).length);
  const avgdl = docLengths.reduce((a, b) => a + b, 0) / n;

  // Compute IDF per query term: log((N - df + 0.5) / (df + 0.5) + 1)
  const idf = new Map();
  for (const term of queryTerms) {
    let df = 0;
    for (const tf of docTFs) {
      if (tf.has(term)) df++;
    }
    idf.set(term, Math.log((n - df + 0.5) / (df + 0.5) + 1));
  }

  // Score each document
  const scores = new Array(n);
  for (let i = 0; i < n; i++) {
    let score = 0;
    const tf = docTFs[i];
    const dl = docLengths[i];
    for (const term of queryTerms) {
      const termTf = tf.get(term) || 0;
      if (termTf === 0) continue;
      const termIdf = idf.get(term);
      score += termIdf * (termTf * (k1 + 1)) / (termTf + k1 * (1 - b + b * dl / avgdl));
    }
    scores[i] = score;
  }

  return scores;
}

/**
 * Score a single document against pre-extracted keywords.
 * Thin wrapper for use in MMR loops where docs are scored one at a time.
 *
 * @param {string[]} keywords - Pre-extracted query keywords
 * @param {string} document - Single document string
 * @param {number} avgDocLength - Average document length across corpus
 * @param {object} [params] - { k1: 1.5, b: 0.75 }
 * @returns {number} BM25 score
 */
export function bm25ScoreSingle(keywords, document, avgDocLength, params = {}) {
  const { k1 = 1.5, b = 0.75 } = params;
  if (!keywords.length || !document) return 0;

  const tf = termFrequency(document);
  const dl = (document || '').split(/\s+/).length;

  let score = 0;
  for (const term of keywords) {
    const termTf = tf.get(term) || 0;
    if (termTf === 0) continue;
    // Simplified IDF for single-doc: assume term appears in ~50% of corpus
    const idf = Math.log(2);
    score += idf * (termTf * (k1 + 1)) / (termTf + k1 * (1 - b + b * dl / avgDocLength));
  }

  return score;
}
