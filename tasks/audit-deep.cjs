const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'audit-screenshots');
const BASE_URL = 'http://localhost:8086';

async function runDeepAudit() {
  const findings = [];
  const browser = await chromium.launch({ headless: true });

  // ============================================
  // 1. Landing page deep inspection
  // ============================================
  console.log('\n=== DEEP: Landing page ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    // Check all links on landing page
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({
        href: a.href,
        text: a.innerText.trim().substring(0, 50),
        target: a.target,
      }));
    });
    console.log(`  Found ${links.length} links on landing page`);

    // Check for broken internal links
    const internalLinks = links.filter(l => l.href.startsWith(BASE_URL) || l.href.startsWith('/'));
    for (const link of internalLinks.slice(0, 15)) {
      try {
        const resp = await page.evaluate(async (url) => {
          const r = await fetch(url, { method: 'HEAD' });
          return r.status;
        }, link.href);
        if (resp >= 400) {
          findings.push({
            severity: 'MEDIUM',
            issue: `Broken internal link: "${link.text}" -> ${link.href} (${resp})`,
            route: '/',
            category: 'broken-link'
          });
          console.log(`  BROKEN LINK: "${link.text}" -> ${link.href} (${resp})`);
        }
      } catch (e) {
        // Link might use client-side routing
      }
    }

    // Check images
    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        displayed: img.offsetWidth > 0 && img.offsetHeight > 0,
      }));
    });

    const brokenImages = images.filter(i => i.naturalWidth === 0);
    if (brokenImages.length > 0) {
      findings.push({
        severity: 'HIGH',
        issue: `${brokenImages.length} broken images on landing page`,
        details: brokenImages.map(i => i.src),
        route: '/',
        category: 'broken-image'
      });
      console.log(`  BROKEN IMAGES: ${brokenImages.length}`);
    }

    const missingAlt = images.filter(i => !i.alt);
    if (missingAlt.length > 0) {
      findings.push({
        severity: 'LOW',
        issue: `${missingAlt.length} images missing alt text on landing page`,
        details: missingAlt.map(i => i.src.substring(0, 80)),
        route: '/',
        category: 'accessibility'
      });
      console.log(`  MISSING ALT: ${missingAlt.length} images`);
    }

    // Check heading hierarchy
    const headings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
        tag: h.tagName,
        text: h.innerText.trim().substring(0, 60),
        visible: h.offsetHeight > 0,
      }));
    });
    console.log(`  Headings: ${headings.map(h => `${h.tag}:"${h.text}"`).join(', ')}`);

    const h1Count = headings.filter(h => h.tag === 'H1').length;
    if (h1Count === 0) {
      findings.push({ severity: 'MEDIUM', issue: 'No H1 heading on landing page', route: '/', category: 'seo' });
    } else if (h1Count > 1) {
      findings.push({ severity: 'LOW', issue: `Multiple H1 headings (${h1Count}) on landing page`, route: '/', category: 'seo' });
    }

    // Check meta tags
    const meta = await page.evaluate(() => {
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || null,
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || null,
        ogDescription: document.querySelector('meta[property="og:description"]')?.content || null,
        viewport: document.querySelector('meta[name="viewport"]')?.content || null,
      };
    });
    console.log(`  Title: "${meta.title}"`);
    console.log(`  Description: ${meta.description ? '"' + meta.description.substring(0, 60) + '..."' : 'MISSING'}`);
    if (!meta.description) {
      findings.push({ severity: 'MEDIUM', issue: 'Missing meta description', route: '/', category: 'seo' });
    }
    if (!meta.ogTitle) {
      findings.push({ severity: 'LOW', issue: 'Missing Open Graph title', route: '/', category: 'seo' });
    }

    // Check CTA buttons
    const ctas = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, a[role="button"], a.btn, [class*="cta"]')).map(el => ({
        tag: el.tagName,
        text: el.innerText.trim().substring(0, 50),
        href: el.href || null,
        visible: el.offsetHeight > 0,
        clickable: !el.disabled,
      }));
    });
    console.log(`  CTAs/Buttons: ${ctas.length}`);

    // Check for horizontal scrollbar (overflow issue)
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    if (hasHorizontalScroll) {
      findings.push({ severity: 'HIGH', issue: 'Horizontal scroll detected on landing page (desktop)', route: '/', category: 'layout' });
      console.log('  HORIZONTAL SCROLL DETECTED');
    }

    // Check console errors
    if (errors.length > 0) {
      findings.push({
        severity: 'MEDIUM',
        issue: `${errors.length} JS console errors on landing page`,
        details: errors.slice(0, 5),
        route: '/',
        category: 'js-error'
      });
    }

    await ctx.close();
  }

  // ============================================
  // 2. Landing mobile overflow check
  // ============================================
  console.log('\n=== DEEP: Landing mobile overflow ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    if (hasHorizontalScroll) {
      findings.push({ severity: 'HIGH', issue: 'Horizontal scroll on landing page (mobile 390px)', route: '/', category: 'responsive' });
      console.log('  HORIZONTAL SCROLL on mobile');
    } else {
      console.log('  No horizontal scroll - OK');
    }

    // Check font sizes are readable
    const smallText = await page.evaluate(() => {
      const elements = document.querySelectorAll('p, span, li, a, td');
      let tooSmall = 0;
      for (const el of elements) {
        const style = getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);
        if (fontSize < 12 && el.offsetHeight > 0 && el.innerText.trim().length > 0) {
          tooSmall++;
        }
      }
      return tooSmall;
    });
    if (smallText > 0) {
      findings.push({ severity: 'MEDIUM', issue: `${smallText} text elements below 12px on mobile`, route: '/', category: 'responsive' });
      console.log(`  ${smallText} text elements too small on mobile`);
    } else {
      console.log('  Text sizes OK on mobile');
    }

    // Check touch targets
    const smallTouchTargets = await page.evaluate(() => {
      const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
      let tooSmall = 0;
      for (const el of interactive) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          // Only count visible elements
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            tooSmall++;
          }
        }
      }
      return tooSmall;
    });
    if (smallTouchTargets > 3) {
      findings.push({ severity: 'LOW', issue: `${smallTouchTargets} touch targets below 44px on mobile landing page`, route: '/', category: 'accessibility' });
      console.log(`  ${smallTouchTargets} small touch targets on mobile`);
    }

    await ctx.close();
  }

  // ============================================
  // 3. Discover page deep inspection
  // ============================================
  console.log('\n=== DEEP: Discover page ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check email input on discover
    const hasEmailInput = await page.locator('input[type="email"], input[placeholder*="email" i]').count() > 0;
    console.log(`  Email input: ${hasEmailInput}`);

    // Check pricing section
    const hasPricing = await page.evaluate(() => {
      return document.body.innerText.includes('$0') || document.body.innerText.includes('Free');
    });
    console.log(`  Pricing section: ${hasPricing}`);

    // Check FAQ section
    const hasFAQ = await page.evaluate(() => {
      return document.body.innerText.toLowerCase().includes('faq') || document.body.innerText.includes('frequently');
    });
    console.log(`  FAQ section: ${hasFAQ}`);

    // Check footer
    const hasFooter = await page.locator('footer').count() > 0;
    console.log(`  Footer: ${hasFooter}`);

    // Nav links
    const navLinks = await page.evaluate(() => {
      const nav = document.querySelector('nav') || document.querySelector('header');
      if (!nav) return [];
      return Array.from(nav.querySelectorAll('a')).map(a => ({
        text: a.innerText.trim(),
        href: a.href,
      }));
    });
    console.log(`  Nav links: ${navLinks.map(l => l.text).join(', ')}`);

    if (errors.length > 0) {
      findings.push({
        severity: 'MEDIUM',
        issue: `${errors.length} JS errors on /discover`,
        details: errors.slice(0, 3),
        route: '/discover',
        category: 'js-error'
      });
    }

    await ctx.close();
  }

  // ============================================
  // 4. Auth page deep inspection
  // ============================================
  console.log('\n=== DEEP: Auth page ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check invite code input
    const inviteInput = await page.locator('input[placeholder*="invite" i], input[placeholder*="code" i]').count();
    console.log(`  Invite code input: ${inviteInput > 0}`);

    // Check Google button
    const googleBtn = await page.locator('button:has-text("Google"), [class*="google" i]').count();
    console.log(`  Google auth button: ${googleBtn > 0}`);

    // Check "Join the waitlist" link
    const waitlistLink = await page.locator('a:has-text("waitlist"), button:has-text("waitlist")').count();
    console.log(`  Waitlist link: ${waitlistLink > 0}`);

    // Check Terms of Service / Privacy Policy links
    const tosLink = await page.locator('a:has-text("Terms")').count();
    const privacyLink = await page.locator('a:has-text("Privacy")').count();
    console.log(`  ToS link: ${tosLink > 0}, Privacy link: ${privacyLink > 0}`);

    // Check the right panel (soul signature awaits)
    const rightPanel = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('soul signature') || text.includes('Soul Signature');
    });
    console.log(`  Right panel text: ${rightPanel}`);

    // Verify the "Continue with Google" button is clickable (but don't click it)
    const googleBtnEnabled = await page.evaluate(() => {
      const btn = document.querySelector('button');
      if (!btn) return null;
      const buttons = Array.from(document.querySelectorAll('button'));
      const googleBtn = buttons.find(b => b.innerText.includes('Google'));
      if (!googleBtn) return null;
      return !googleBtn.disabled;
    });
    console.log(`  Google button enabled: ${googleBtnEnabled}`);

    // Check if invite code is actually required (button disabled without it)
    const verifyBtnState = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const verifyBtn = btns.find(b => b.innerText.includes('Verify'));
      if (!verifyBtn) return 'not found';
      return verifyBtn.disabled ? 'disabled' : 'enabled';
    });
    console.log(`  Verify button state: ${verifyBtnState}`);

    // Verify Google button has correct visual styling (should be rounded pill)
    const googleBtnStyle = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const googleBtn = btns.find(b => b.innerText.includes('Google'));
      if (!googleBtn) return null;
      const style = getComputedStyle(googleBtn);
      return {
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    });
    console.log(`  Google btn style: radius=${googleBtnStyle?.borderRadius}, bg=${googleBtnStyle?.backgroundColor}`);

    if (errors.length > 0) {
      errors.forEach(e => console.log(`  ERROR: ${e.substring(0, 150)}`));
      findings.push({
        severity: 'MEDIUM',
        issue: `${errors.length} JS errors on /auth`,
        details: errors.slice(0, 3),
        route: '/auth',
        category: 'js-error'
      });
    }

    await ctx.close();
  }

  // ============================================
  // 5. Performance check on landing page
  // ============================================
  console.log('\n=== DEEP: Performance ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const startTime = Date.now();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
    const loadTime = Date.now() - startTime;

    console.log(`  Landing page load time: ${loadTime}ms`);
    if (loadTime > 5000) {
      findings.push({ severity: 'HIGH', issue: `Landing page load time ${loadTime}ms (>5s)`, route: '/', category: 'performance' });
    } else if (loadTime > 3000) {
      findings.push({ severity: 'MEDIUM', issue: `Landing page load time ${loadTime}ms (>3s)`, route: '/', category: 'performance' });
    }

    // Check bundle sizes via network requests
    const resources = await page.evaluate(() => {
      return performance.getEntriesByType('resource').map(r => ({
        name: r.name.split('/').pop().split('?')[0],
        type: r.initiatorType,
        size: r.transferSize,
        duration: Math.round(r.duration),
      })).filter(r => r.size > 100000).sort((a, b) => b.size - a.size);
    });

    if (resources.length > 0) {
      console.log('  Large resources (>100KB):');
      resources.forEach(r => {
        console.log(`    ${r.name}: ${Math.round(r.size / 1024)}KB (${r.duration}ms)`);
      });
    }

    await ctx.close();
  }

  // ============================================
  // 6. Design system compliance check
  // ============================================
  console.log('\n=== DEEP: Design system compliance ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);

    // Check body background color
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    console.log(`  Body bg: ${bodyBg}`);
    // Should be #13121a or close

    // Check if Instrument Serif is loaded for headings
    const fontCheck = await page.evaluate(() => {
      const headings = document.querySelectorAll('h1, h2, h3');
      const fonts = new Set();
      headings.forEach(h => {
        fonts.add(getComputedStyle(h).fontFamily.split(',')[0].trim().replace(/["']/g, ''));
      });
      return Array.from(fonts);
    });
    console.log(`  Heading fonts: ${fontCheck.join(', ')}`);

    // Check body font
    const bodyFont = await page.evaluate(() => {
      const p = document.querySelector('p');
      return p ? getComputedStyle(p).fontFamily.split(',')[0].trim().replace(/["']/g, '') : 'none';
    });
    console.log(`  Body font: ${bodyFont}`);

    // Check if dark mode only (no light mode toggle)
    const hasLightToggle = await page.evaluate(() => {
      const text = document.body.innerHTML.toLowerCase();
      return text.includes('light mode') || text.includes('theme-toggle') || text.includes('darkmode');
    });
    if (hasLightToggle) {
      findings.push({ severity: 'LOW', issue: 'Light mode toggle found (design is dark-only)', route: '/', category: 'design' });
    }

    await ctx.close();
  }

  // ============================================
  // 7. Discover page at all breakpoints - pricing check
  // ============================================
  console.log('\n=== DEEP: Discover pricing at mobile ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check horizontal scroll
    const hasHScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    if (hasHScroll) {
      findings.push({ severity: 'HIGH', issue: 'Horizontal scroll on /discover (mobile 390px)', route: '/discover', category: 'responsive' });
      console.log('  HORIZONTAL SCROLL on mobile discover');
    } else {
      console.log('  No horizontal scroll - OK');
    }

    // Check pricing cards don't overlap
    const pricingOverflow = await page.evaluate(() => {
      // Look for pricing cards
      const cards = document.querySelectorAll('[class*="pricing"], [class*="plan"], [class*="tier"]');
      if (cards.length === 0) return 'no pricing cards found by class';

      let overflow = false;
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        if (rect.right > window.innerWidth) overflow = true;
      });
      return overflow ? 'OVERFLOW' : 'OK';
    });
    console.log(`  Pricing cards: ${pricingOverflow}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'discover-mobile-pricing.png'), fullPage: false });

    await ctx.close();
  }

  // ============================================
  // 8. Check /auth redirect behavior from protected routes
  // ============================================
  console.log('\n=== DEEP: Auth redirect test ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const protectedRoutes = ['/dashboard', '/chat', '/settings', '/identity', '/goals'];
    for (const route of protectedRoutes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 15000 });
      const finalUrl = page.url();
      const redirectedToAuth = finalUrl.includes('/auth');
      console.log(`  ${route} -> ${redirectedToAuth ? '/auth (correct)' : finalUrl.replace(BASE_URL, '') + ' (UNEXPECTED)'}`);

      if (!redirectedToAuth) {
        findings.push({
          severity: 'HIGH',
          issue: `Protected route ${route} did NOT redirect to /auth`,
          route: route,
          category: 'auth'
        });
      }
    }

    await ctx.close();
  }

  // ============================================
  // 9. Check for console errors on /discover at all widths
  // ============================================
  console.log('\n=== DEEP: Discover console errors ===');
  for (const width of [1440, 768, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);

    if (errors.length > 0) {
      console.log(`  [${width}px] ${errors.length} errors:`);
      errors.forEach(e => console.log(`    ${e.substring(0, 120)}`));
    } else {
      console.log(`  [${width}px] No errors`);
    }

    await ctx.close();
  }

  // ============================================
  // 10. Check for accessibility basics
  // ============================================
  console.log('\n=== DEEP: Accessibility basics ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);

    // Check for skip navigation link
    const hasSkipNav = await page.evaluate(() => {
      return !!document.querySelector('a[href="#main"], a[href="#content"], .skip-nav, [class*="skip"]');
    });
    console.log(`  Skip navigation: ${hasSkipNav ? 'YES' : 'NO'}`);
    if (!hasSkipNav) {
      findings.push({ severity: 'LOW', issue: 'Missing skip navigation link', route: '/', category: 'accessibility' });
    }

    // Check for lang attribute
    const hasLang = await page.evaluate(() => document.documentElement.lang);
    console.log(`  HTML lang: "${hasLang}"`);
    if (!hasLang) {
      findings.push({ severity: 'LOW', issue: 'Missing lang attribute on html element', route: '/', category: 'accessibility' });
    }

    // Check form labels
    const unlabeledInputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])');
      let unlabeled = 0;
      inputs.forEach(input => {
        const hasLabel = input.labels?.length > 0 || input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || input.placeholder;
        if (!hasLabel) unlabeled++;
      });
      return unlabeled;
    });
    if (unlabeledInputs > 0) {
      findings.push({ severity: 'MEDIUM', issue: `${unlabeledInputs} unlabeled form inputs`, route: '/', category: 'accessibility' });
      console.log(`  Unlabeled inputs: ${unlabeledInputs}`);
    } else {
      console.log('  All inputs have labels/placeholders');
    }

    // Check color contrast on primary text (basic check)
    const contrastIssue = await page.evaluate(() => {
      // Check if primary text color has enough contrast with background
      const body = document.body;
      const style = getComputedStyle(body);
      const bg = style.backgroundColor;
      const color = style.color;
      return { bg, color };
    });
    console.log(`  Body text contrast: bg=${contrastIssue.bg}, text=${contrastIssue.color}`);

    await ctx.close();
  }

  // ============================================
  // FINAL REPORT
  // ============================================
  await browser.close();

  const reportPath = path.join(__dirname, 'audit-deep-findings.json');
  fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

  console.log(`\n========== DEEP AUDIT SUMMARY ==========`);
  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const high = findings.filter(f => f.severity === 'HIGH');
  const medium = findings.filter(f => f.severity === 'MEDIUM');
  const low = findings.filter(f => f.severity === 'LOW');

  console.log(`Total issues: ${findings.length}`);
  console.log(`  CRITICAL: ${critical.length}`);
  console.log(`  HIGH: ${high.length}`);
  console.log(`  MEDIUM: ${medium.length}`);
  console.log(`  LOW: ${low.length}`);
  console.log(`==========================================\n`);

  if (findings.length > 0) {
    console.log('ALL FINDINGS:');
    findings.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.severity}] [${f.category}] ${f.issue} (${f.route})`);
      if (f.details) {
        (Array.isArray(f.details) ? f.details : [f.details]).slice(0, 3).forEach(d => {
          console.log(`      -> ${typeof d === 'string' ? d.substring(0, 120) : JSON.stringify(d).substring(0, 120)}`);
        });
      }
    });
  }
}

runDeepAudit().catch(console.error);
