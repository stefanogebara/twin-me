/**
 * GDPR parser: Google Search (Takeout My Activity).
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { getHourInTimeZone, monthYearInTimeZone } from '../shared.js';

// ---------------------------------------------------------------------------
// Google Search (Takeout My Activity) parser
// ---------------------------------------------------------------------------

function parseGoogleSearch(buffer, timezone) {
  let raw;
  try {
    raw = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Invalid Google Search JSON — expected MyActivity.json from Google Takeout');
  }

  if (!Array.isArray(raw)) {
    throw new Error('Google Search Takeout file must be a JSON array');
  }

  const MAX_INDIVIDUAL = 200;

  // Extract search query from title (Google formats as "Searched for <query>")
  const extractQuery = (title) => {
    if (!title) return null;
    const match = String(title).match(/^Searched for (.+)$/i);
    return match ? match[1].trim() : null;
  };

  const wordCounts = {};
  const hourBuckets = new Array(24).fill(0);
  const individualEntries = [];
  let totalSearches = 0;

  for (const entry of raw) {
    // Filter to Search product entries only (skip Maps, YouTube, etc.)
    const products = entry.products || [];
    const isSearch = products.includes('Search') || entry.header === 'Search';
    if (!isSearch) continue;

    const query = extractQuery(entry.title);
    if (!query) continue;

    totalSearches++;

    const when = entry.time ? new Date(entry.time) : null;
    if (when && !isNaN(when.getTime())) {
      hourBuckets[getHourInTimeZone(when, timezone)]++;
      individualEntries.push({ query, when });
    } else {
      individualEntries.push({ query, when: null });
    }

    // Tokenize query into words for topic extraction
    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4); // skip short stop-words

    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  const observations = [];

  // Summary: top search topics
  const STOP_WORDS = new Set([
    'what', 'where', 'when', 'how', 'that', 'this', 'with', 'from', 'have',
    'will', 'your', 'they', 'does', 'which', 'about', 'into', 'than', 'more',
    'some', 'like', 'would', 'could', 'should', 'best', 'good', 'many',
    'make', 'most', 'also', 'just', 'over', 'know', 'need', 'much',
    'between', 'after', 'before', 'their', 'there', 'being', 'been', 'were',
  ]);

  const topWords = Object.entries(wordCounts)
    .filter(([word]) => !STOP_WORDS.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  if (topWords.length > 0 && totalSearches > 0) {
    const topTopics = topWords.slice(0, 8).map(([w]) => w).join(', ');
    observations.push(
      `Google Search history shows strong interest in: ${topTopics} ` +
      `(${totalSearches.toLocaleString()} total searches)`
    );
  }

  // Semantic topic clustering — bucket the top 30 words into interest
  // categories so the twin can say "you research finance, health, and
  // software engineering" rather than just listing raw words.
  if (topWords.length > 0 && totalSearches >= 20) {
    const TOPIC_MAP = {
      tech:       /^(javascript|typescript|python|react|node|vue|rust|golang|kubernetes|docker|linux|github|vscode|npm|api|database|postgres|sql|nosql|redis|mongodb|serverless|aws|azure|gcp|tailwind|nextjs|vite|webpack|esbuild|nginx|graphql|postgresql|lambda|terraform|ansible|kafka|async|await|typescript|ruby|php|java|kotlin|swift|flutter|android|ios|web3|solidity|ethereum|blockchain)$/,
      ai:         /^(openai|claude|anthropic|llm|gpt|prompt|langchain|rag|embedding|vector|transformer|diffusion|stable|midjourney|gemini|mistral|finetune|training|pytorch|tensorflow|huggingface|agent|autogen|inference|perplexity)$/,
      health:     /^(sleep|hrv|workout|exercise|fitness|nutrition|diet|protein|supplement|vitamin|cortisol|testosterone|injury|pain|stretch|mobility|yoga|pilates|running|cycling|climb|fasting|meditation|mindful|therapy|anxiety|depression|adhd|burnout|stress|recovery|hormone|magnesium|creatine)$/,
      finance:    /^(invest|stock|crypto|bitcoin|etf|dividend|401k|ira|tax|taxes|irs|mortgage|refinance|rental|property|equity|valuation|revenue|ebitda|runway|burn|seed|series|vc|venture|startup|founder|angel|cap\s*table|secondary|liquidity|ipo|spac|roth|bonds|treasury|yield|inflation|portfolio|hedge|margin|option|futures|currency|forex|dollar|euro|pound|yen|real\s*estate|airbnb|reit|mutual|index|s&p|nasdaq)$/,
      travel:     /^(flight|flights|hotel|airbnb|booking|visa|passport|embassy|airport|airline|delta|united|american|iberia|emirates|itinerary|cruise|miles|points|expedia|kayak|skyscanner|turkish|lounge|lhr|jfk|lax|hnd|cdg|mad|bcn|gru|mia|layover|jetlag)$/,
      food:       /^(recipe|cooking|restaurant|menu|cuisine|pasta|sushi|ramen|burger|steak|salad|vegan|vegetarian|keto|paleo|mediterranean|dietician|brunch|cocktail|wine|pairing|michelin|chef|knife|cast\s*iron|sourdough|fermented)$/,
      entertainment: /^(movie|film|netflix|hbo|showtime|disney|hulu|series|season|episode|trailer|director|actor|actress|soundtrack|podcast|audiobook|series|episode|imdb|rotten|tomatoes|letterboxd|goodreads|vinyl|spotify|playlist|concert|tour|festival|lineup|coachella|glastonbury)$/,
      sports:     /^(nfl|nba|mlb|nhl|mls|uefa|fifa|champions|premier|bundesliga|laliga|formula|f1|nascar|ufc|mma|boxing|tennis|golf|pga|lpga|atp|wta|wimbledon|olympics|marathon|triathlon|ironman|cycling|tour\s*de\s*france|giro|vuelta|stanley|superbowl|worldcup|fantasy)$/,
      career:     /^(interview|salary|negotiate|offer|promotion|linkedin|recruiter|resume|cv|application|employer|employee|benefits|equity|401k|severance|layoff|manager|director|engineer|designer|analyst|consulting|mba|phd|internship|graduate|junior|senior|staff|principal|vp|ceo|cto|cpo|cmo|hr)$/,
      shopping:   /^(amazon|ebay|shopify|etsy|review|reviews|deal|deals|discount|coupon|promo|bestbuy|target|walmart|costco|apple|store|iphone|samsung|pixel|macbook|laptop|headphone|airpod|kindle|keyboard|monitor|speaker)$/,
      news:       /^(election|president|senate|congress|policy|russia|ukraine|israel|china|inflation|unemployment|gdp|war|sanction|embargo|treaty|parliament|government|minister|prime|politics|debate|ruling|court|supreme|justice|senator|mayor|governor)$/,
      learning:   /^(tutorial|course|udemy|coursera|edx|mooc|class|lecture|textbook|study|thesis|paper|arxiv|research|academic|pubmed|scholar|journal|citation|proof|theorem|equation|calculus|algebra|statistics|probability|linear|matrix|integral|derivative)$/,
    };
    const buckets = {};
    for (const [word, count] of topWords) {
      for (const [topic, re] of Object.entries(TOPIC_MAP)) {
        if (re.test(word)) {
          buckets[topic] = (buckets[topic] || 0) + count;
          break;
        }
      }
    }
    const topClusters = Object.entries(buckets)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    if (topClusters.length >= 2) {
      const totalClustered = topClusters.reduce((sum, [, c]) => sum + c, 0);
      const parts = topClusters
        .filter(([, c]) => c / totalClustered >= 0.05)
        .map(([topic, c]) => `${topic} (${Math.round((c / totalClustered) * 100)}%)`);
      observations.push(
        `Your Google searches cluster into: ${parts.join(', ')} — reveals where your attention actually goes`
      );
    }
  }

  // Time-of-day pattern
  const totalHourPlays = hourBuckets.reduce((a, b) => a + b, 0);
  if (totalHourPlays > 0) {
    let peakHour = 0;
    for (let h = 1; h < 24; h++) {
      if (hourBuckets[h] > hourBuckets[peakHour]) peakHour = h;
    }
    const fmt = (h) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    const morning   = hourBuckets.slice(6, 12).reduce((a, b) => a + b, 0);
    const evening   = hourBuckets.slice(18, 22).reduce((a, b) => a + b, 0);
    const lateNight = hourBuckets.slice(22, 24).reduce((a, b) => a + b, 0)
      + hourBuckets.slice(0, 6).reduce((a, b) => a + b, 0);
    const pct = (n) => Math.round((n / totalHourPlays) * 100);
    observations.push(
      `Google search timing: ${pct(morning)}% morning, ${pct(evening)}% evening, ${pct(lateNight)}% late-night. Peak hour: ${fmt(peakHour)}`
    );
  }

  // Individual search observations (most recent MAX_INDIVIDUAL)
  const individualObs = individualEntries
    .sort((a, b) => {
      if (!a.when && !b.when) return 0;
      if (!a.when) return 1;
      if (!b.when) return -1;
      return b.when.getTime() - a.when.getTime();
    })
    .slice(0, MAX_INDIVIDUAL)
    .map(({ query, when }) => {
      const monthYear = when ? monthYearInTimeZone(when, timezone) : '';
      return monthYear
        ? `Searched for: ${query.slice(0, 100)} (${monthYear})`
        : `Searched for: ${query.slice(0, 100)}`;
    });

  return [...observations, ...individualObs];
}

export { parseGoogleSearch };
