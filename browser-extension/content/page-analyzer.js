/**
 * Soul Signature - Page Analyzer
 *
 * This script is injected ONLY when the user explicitly clicks
 * "Analyze this page" in the popup. It uses the `activeTab` permission
 * (granted temporarily on user click) — NOT a persistent content script.
 *
 * It reads publicly visible page metadata and returns a structured analysis.
 * It never reads form data, passwords, or private content.
 */

(function analyzePage() {
  // ── Helpers ──────────────────────────────────────────────────────────────

  function getMeta(name) {
    const el = document.querySelector(
      `meta[name="${name}"], meta[property="${name}"], meta[property="og:${name}"]`
    );
    return el ? (el.getAttribute('content') || '').trim() : '';
  }

  function getKeywords() {
    const raw = getMeta('keywords');
    if (!raw) return [];
    return raw.split(',').map(k => k.trim()).filter(Boolean).slice(0, 10);
  }

  function estimateReadingTime(wordCount) {
    // Average reading speed: 238 wpm
    return Math.max(1, Math.round(wordCount / 238));
  }

  function getMainText() {
    // Remove navigation, headers, footers, scripts, styles
    const excluded = ['nav', 'header', 'footer', 'script', 'style', 'aside', 'form'];
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll(excluded.join(',')).forEach(el => el.remove());
    return clone.innerText || clone.textContent || '';
  }

  function detectContentType() {
    const url = window.location.href;
    const title = document.title.toLowerCase();
    const h1 = (document.querySelector('h1') || {}).textContent || '';

    if (url.includes('youtube.com/watch')) return 'video';
    if (url.includes('/watch') || url.includes('/video')) return 'video';
    if (document.querySelector('article')) return 'article';
    if (document.querySelector('video')) return 'video';
    if (document.querySelector('.post, .blog-post, .entry-content')) return 'blog';
    if (url.includes('github.com')) return 'code';
    if (url.includes('docs.') || url.includes('/docs/') || url.includes('/documentation')) return 'docs';
    if (url.match(/\/(product|item|dp\/)/)) return 'product';

    return 'webpage';
  }

  function extractHeadings() {
    return Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function getCanonicalUrl() {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) return canonical.href;
    // Strip tracking params
    try {
      const url = new URL(window.location.href);
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
        'utm_content', 'fbclid', 'gclid', 'ref', '_ga'];
      trackingParams.forEach(p => url.searchParams.delete(p));
      return url.toString();
    } catch {
      return window.location.href;
    }
  }

  // ── Analysis ─────────────────────────────────────────────────────────────

  const mainText = getMainText();
  const words = mainText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const result = {
    url: getCanonicalUrl(),
    title: document.title,
    domain: window.location.hostname.replace(/^www\./, ''),
    description: getMeta('description') || getMeta('og:description'),
    author: getMeta('author') || getMeta('article:author'),
    publishedDate: getMeta('article:published_time') || getMeta('datePublished'),
    keywords: getKeywords(),
    headings: extractHeadings(),
    contentType: detectContentType(),
    wordCount,
    estimatedReadingMinutes: estimateReadingTime(wordCount),
    language: document.documentElement.lang || navigator.language,
    analyzedAt: new Date().toISOString(),
  };

  // Send result back to background
  chrome.runtime.sendMessage({
    type: 'PAGE_ANALYSIS_RESULT',
    data: result,
  });

  return result;
})();
