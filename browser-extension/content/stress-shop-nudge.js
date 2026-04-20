/**
 * TwinMe Stress-Shop Nudge — content script
 * ==========================================
 * Runs on iFood, Amazon.com.br, Mercado Livre, Shein checkout pages.
 * When the user lands on a checkout/cart flow, we check their current
 * stress-shop score via the TwinMe API. If high, we inject a non-blocking
 * overlay that says "your HRV dropped today, wait 10 min?" with wait/proceed
 * buttons.
 *
 * Design principles:
 *   - Non-blocking: user can always proceed. Never fully prevent purchase.
 *   - Fires once per cart — de-duped by URL path hash in sessionStorage.
 *   - Graceful: silent if API unreachable or no signals.
 *   - Privacy: only sends outcome + score + hostname (not item details).
 */

(function () {
  'use strict';

  const API_BASE = 'https://twin-ai-learn.vercel.app/api';
  const NUDGE_STORAGE_PREFIX = 'twinme_nudge_shown_';

  /** Detect a checkout/cart page by URL pattern per host. */
  function isCheckoutPage() {
    const { hostname, pathname } = window.location;
    if (/ifood\.com(\.br)?$/i.test(hostname)) {
      return /\/(checkout|pagamento|finalizar)/i.test(pathname);
    }
    if (/amazon\.com\.br$/i.test(hostname)) {
      return /\/gp\/buy\/|\/checkout\/|\/cart\//i.test(pathname);
    }
    if (/mercadolivre\.com\.br$/i.test(hostname)) {
      return /\/checkout\/|\/cart\/|\/confirm/i.test(pathname);
    }
    if (/shein\.com(\.br)?$/i.test(hostname)) {
      return /\/checkout|\/cart/i.test(pathname);
    }
    return false;
  }

  function pathKey() {
    return NUDGE_STORAGE_PREFIX + location.hostname + location.pathname;
  }

  function alreadyShown() {
    try { return sessionStorage.getItem(pathKey()) === '1'; } catch { return false; }
  }

  function markShown() {
    try { sessionStorage.setItem(pathKey(), '1'); } catch { /* no-op */ }
  }

  async function getAuthToken() {
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.get?.(['auth_token'], (res) => {
          resolve(res?.auth_token || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function fetchStressScore(token) {
    try {
      const res = await fetch(`${API_BASE}/transactions/stress-shop-score`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function recordOutcome(token, outcome, score) {
    try {
      await fetch(`${API_BASE}/transactions/nudge-outcome`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outcome,
          score,
          merchant: location.hostname,
          url: location.pathname,
        }),
      });
    } catch { /* silent */ }
  }

  function injectStyles() {
    if (document.getElementById('twinme-nudge-style')) return;
    const style = document.createElement('style');
    style.id = 'twinme-nudge-style';
    style.textContent = [
      '.twinme-nudge-backdrop{position:fixed;inset:0;background:rgba(19,18,26,0.75);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:2147483646;opacity:0;transition:opacity 200ms ease-out;display:flex;align-items:center;justify-content:center;font-family:Geist,Inter,system-ui,sans-serif}',
      '.twinme-nudge-backdrop.visible{opacity:1}',
      '.twinme-nudge-card{background:rgba(30,28,38,0.95);border:1px solid rgba(255,255,255,0.10);border-radius:20px;padding:28px 24px 22px;width:min(92vw,420px);color:#F5F5F4;box-shadow:0 20px 60px rgba(0,0,0,0.55);transform:translateY(8px);transition:transform 220ms ease-out}',
      '.twinme-nudge-backdrop.visible .twinme-nudge-card{transform:translateY(0)}',
      '.twinme-nudge-kicker{font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:rgba(232,160,80,0.95);margin-bottom:10px}',
      '.twinme-nudge-title{font-family:"Instrument Serif",Georgia,serif;font-size:24px;letter-spacing:-0.02em;line-height:1.2;margin:0 0 10px}',
      '.twinme-nudge-sub{font-size:14px;line-height:1.55;color:rgba(255,255,255,0.72);margin:0 0 18px}',
      '.twinme-nudge-actions{display:flex;gap:10px;justify-content:flex-end}',
      '.twinme-nudge-btn{background:transparent;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.75);padding:10px 18px;border-radius:100px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit}',
      '.twinme-nudge-btn.primary{background:rgba(232,160,80,0.18);border-color:rgba(232,160,80,0.35);color:rgba(255,210,160,0.98)}',
      '.twinme-nudge-btn:hover{opacity:0.85}',
      '.twinme-nudge-hint{font-size:11px;color:rgba(255,255,255,0.35);margin-top:14px;text-align:right;font-style:italic}',
    ].join('');
    document.head.appendChild(style);
  }

  function el(tag, attrs = {}, text = null) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v);
    }
    if (text !== null) node.textContent = text;
    return node;
  }

  function showNudge({ score, reason }, token) {
    injectStyles();

    const backdrop = el('div', { class: 'twinme-nudge-backdrop' });
    const card = el('div', { class: 'twinme-nudge-card', role: 'dialog', 'aria-labelledby': 'twinme-nudge-title' });

    card.appendChild(el('div', { class: 'twinme-nudge-kicker' }, 'TwinMe'));
    card.appendChild(el('h2', { id: 'twinme-nudge-title', class: 'twinme-nudge-title' },
      'Antes de comprar — uma pausa?'));

    const sub = el('p', { class: 'twinme-nudge-sub' });
    const reasonText = reason ? reason + '. ' : '';
    sub.textContent = reasonText +
      'Seu padrão mostra que você tende a gastar mais sob stress. Que tal esperar 10 min e voltar se ainda quiser?';
    card.appendChild(sub);

    const actions = el('div', { class: 'twinme-nudge-actions' });
    const proceedBtn = el('button', { type: 'button', class: 'twinme-nudge-btn' }, 'Comprar agora');
    proceedBtn.dataset.action = 'proceed';
    const waitBtn = el('button', { type: 'button', class: 'twinme-nudge-btn primary' }, 'Esperar 10 min');
    waitBtn.dataset.action = 'wait';
    actions.appendChild(proceedBtn);
    actions.appendChild(waitBtn);
    card.appendChild(actions);

    card.appendChild(el('div', { class: 'twinme-nudge-hint' },
      `stress score ${Math.round(score * 100)}% · TwinMe`));

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    const cleanup = (outcome) => {
      recordOutcome(token, outcome, score);
      backdrop.classList.remove('visible');
      setTimeout(() => backdrop.remove(), 220);
    };

    waitBtn.addEventListener('click', () => cleanup('waited'));
    proceedBtn.addEventListener('click', () => cleanup('proceeded'));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup('dismissed');
    });
  }

  async function run() {
    if (!isCheckoutPage() || alreadyShown()) return;

    const token = await getAuthToken();
    if (!token) return;

    const result = await fetchStressScore(token);
    if (!result || !result.success) return;
    if (!result.should_nudge || result.score === null) return;

    markShown();
    showNudge(result, token);
  }

  // Run once on load + observe SPA route changes (iFood / Mercado Livre use pushState)
  let lastHref = location.href;
  const check = () => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      run();
    }
  };
  setInterval(check, 1500);

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(run, 800);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(run, 800));
  }
})();
