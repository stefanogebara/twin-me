/**
 * Statistics Utilities — Pure Math Functions
 * ===========================================
 * Spearman rank correlation, Pearson correlation, log-linear regression.
 * Used by scaling law measurement and twin fidelity scoring.
 *
 * Zero dependencies. All functions are pure.
 */

/**
 * Rank an array (handles ties via average rank).
 * @param {number[]} arr
 * @returns {number[]} ranks (1-based)
 */
export function rank(arr) {
  const n = arr.length;
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    // Find all ties
    while (j < n && indexed[j].v === indexed[i].v) j++;
    // Average rank for ties
    const avgRank = (i + j + 1) / 2; // 1-based: (i+1 + j) / 2
    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j;
  }

  return ranks;
}

/**
 * Pearson correlation between two arrays.
 * @param {number[]} x
 * @param {number[]} y
 * @returns {{ r: number, p: number }}
 */
export function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n < 3 || n !== y.length) return { r: 0, p: 1 };

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return { r: 0, p: 1 };

  const r = num / den;

  // Approximate p-value using t-distribution
  const t = r * Math.sqrt((n - 2) / (1 - r * r + 1e-12));
  // Two-tailed p-value approximation (good for n > 10)
  const p = n > 10
    ? 2 * Math.exp(-0.717 * Math.abs(t) - 0.416 * t * t / n)
    : n > 3 ? Math.max(0.001, 1 - Math.abs(r)) : 1;

  return { r, p: Math.min(1, Math.max(0, p)) };
}

/**
 * Spearman rank correlation between two arrays.
 * @param {number[]} x
 * @param {number[]} y
 * @returns {{ rho: number, p: number }}
 */
export function spearmanCorrelation(x, y) {
  if (x.length < 3 || x.length !== y.length) return { rho: 0, p: 1 };

  const ranksX = rank(x);
  const ranksY = rank(y);
  const { r, p } = pearsonCorrelation(ranksX, ranksY);

  return { rho: r, p };
}

/**
 * Fit log-linear model: y = a * log10(x) + b
 * Uses ordinary least squares on log10-transformed x values.
 *
 * @param {number[]} xValues - Independent variable (e.g., memory count)
 * @param {number[]} yValues - Dependent variable (e.g., quality score)
 * @returns {{ a: number, b: number, r2: number, predicted: number[] }}
 */
export function fitLogLinear(xValues, yValues) {
  const n = xValues.length;
  if (n < 2) return { a: 0, b: yValues[0] || 0, r2: 0, predicted: yValues.slice() };

  // Transform x to log10(x), filtering out non-positive values
  const logX = xValues.map(x => x > 0 ? Math.log10(x) : 0);

  // OLS: y = a * logX + b
  const meanLogX = logX.reduce((a, b) => a + b, 0) / n;
  const meanY = yValues.reduce((a, b) => a + b, 0) / n;

  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = logX[i] - meanLogX;
    const dy = yValues[i] - meanY;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  const a = ssXX > 0 ? ssXY / ssXX : 0;
  const b = meanY - a * meanLogX;

  // R-squared
  const predicted = logX.map(lx => a * lx + b);
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (yValues[i] - predicted[i]) ** 2;
  }
  const r2 = ssYY > 0 ? 1 - ssRes / ssYY : 0;

  return { a, b, r2, predicted };
}

/**
 * Cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} similarity in [-1, 1]
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}
