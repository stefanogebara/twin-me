import { chromium } from 'playwright';

async function diagnoseTheme() {
  console.log('🔍 Starting theme toggle diagnostic...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  // Listen to console logs
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.text()}`);
  });

  try {
    // Navigate to the app
    console.log('📍 Step 1: Navigating to http://localhost:8086\n');
    await page.goto('http://localhost:8086', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Initial state inspection
    console.log('🔎 Step 2: Inspecting initial state\n');
    const initialState = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const computedStyles = window.getComputedStyle(html);

      return {
        htmlDataTheme: html.getAttribute('data-theme'),
        bodyDataTheme: body.getAttribute('data-theme'),
        cssVariables: {
          background: computedStyles.getPropertyValue('--background'),
          foreground: computedStyles.getPropertyValue('--foreground'),
          primary: computedStyles.getPropertyValue('--primary'),
          card: computedStyles.getPropertyValue('--card'),
        },
        computedColors: {
          backgroundColor: window.getComputedStyle(body).backgroundColor,
          color: window.getComputedStyle(body).color,
        },
        localStorage: localStorage.getItem('theme'),
      };
    });

    console.log('Initial State:');
    console.log('  HTML data-theme:', initialState.htmlDataTheme);
    console.log('  Body data-theme:', initialState.bodyDataTheme);
    console.log('  LocalStorage theme:', initialState.localStorage);
    console.log('  CSS Variables:', initialState.cssVariables);
    console.log('  Computed Colors:', initialState.computedColors);
    console.log();

    // Take initial screenshot
    await page.screenshot({ path: 'C:\\Users\\stefa\\theme-initial.png', fullPage: true });
    console.log('📸 Screenshot saved: theme-initial.png\n');

    // Find the theme toggle button
    console.log('🔎 Step 3: Finding theme toggle button\n');

    // Get all buttons and inspect them
    const buttonInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.map((btn, idx) => ({
        index: idx,
        text: btn.textContent?.trim(),
        ariaLabel: btn.getAttribute('aria-label'),
        className: btn.className,
        hasSvg: btn.querySelector('svg') ? 'yes' : 'no',
        svgClasses: btn.querySelector('svg')?.getAttribute('class') || 'none',
      }));
    });

    console.log('Buttons found on page:');
    buttonInfo.forEach(btn => {
      console.log(`  [${btn.index}] "${btn.text}" | aria-label: "${btn.ariaLabel}" | has SVG: ${btn.hasSvg} | SVG: ${btn.svgClasses}`);
    });
    console.log();

    // Try to find the theme toggle - look for button with Sun or Moon icon
    const themeButtonSelector = 'button:has(svg)';
    const buttons = await page.locator(themeButtonSelector).all();

    if (buttons.length === 0) {
      console.log('❌ No theme toggle button found!');
      await browser.close();
      return;
    }

    console.log(`Found ${buttons.length} buttons with SVG icons. Clicking the first one...\n`);

    // Click the toggle button multiple times
    console.log('🖱️  Step 4: Clicking theme toggle multiple times\n');

    for (let click = 1; click <= 4; click++) {
      console.log(`--- Click ${click} ---`);

      await buttons[0].click();
      await page.waitForTimeout(1000);

      // Check state after click
      const afterClickState = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        const computedStyles = window.getComputedStyle(html);
        const bodyStyles = window.getComputedStyle(body);

        return {
          htmlDataTheme: html.getAttribute('data-theme'),
          bodyDataTheme: body.getAttribute('data-theme'),
          cssVariables: {
            background: computedStyles.getPropertyValue('--background').trim(),
            foreground: computedStyles.getPropertyValue('--foreground').trim(),
            primary: computedStyles.getPropertyValue('--primary').trim(),
            card: computedStyles.getPropertyValue('--card').trim(),
          },
          computedColors: {
            htmlBackground: computedStyles.backgroundColor,
            bodyBackground: bodyStyles.backgroundColor,
            bodyColor: bodyStyles.color,
          },
          localStorage: localStorage.getItem('theme'),
          actualBackgroundColor: window.getComputedStyle(document.body).getPropertyValue('background-color'),
        };
      });

      console.log('  After Click State:');
      console.log('    HTML data-theme:', afterClickState.htmlDataTheme);
      console.log('    Body data-theme:', afterClickState.bodyDataTheme);
      console.log('    LocalStorage theme:', afterClickState.localStorage);
      console.log('    CSS Variables:', afterClickState.cssVariables);
      console.log('    Computed Colors:', afterClickState.computedColors);
      console.log('    Actual Background:', afterClickState.actualBackgroundColor);
      console.log();

      // Take screenshot after each click
      await page.screenshot({ path: `C:\\Users\\stefa\\theme-after-click-${click}.png`, fullPage: true });
      console.log(`  📸 Screenshot saved: theme-after-click-${click}.png\n`);
    }

    // Deep CSS inspection
    console.log('🔎 Step 5: Deep CSS inspection\n');

    const cssAnalysis = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;

      // Check if background is applied via CSS variable or hardcoded
      const bodyStyles = window.getComputedStyle(body);
      const htmlStyles = window.getComputedStyle(html);

      // Get all stylesheets
      const stylesheets = Array.from(document.styleSheets);
      let themeRules = [];

      stylesheets.forEach((sheet, idx) => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          rules.forEach(rule => {
            if (rule.selectorText && (
              rule.selectorText.includes('[data-theme') ||
              rule.selectorText.includes(':root') ||
              rule.selectorText.includes('html') ||
              rule.selectorText.includes('body')
            )) {
              themeRules.push({
                selector: rule.selectorText,
                properties: rule.style.cssText.substring(0, 200),
              });
            }
          });
        } catch (e) {
          // CORS or other issues accessing stylesheet
        }
      });

      return {
        bodyInlineStyle: body.getAttribute('style'),
        htmlInlineStyle: html.getAttribute('style'),
        bodyComputedBackground: bodyStyles.backgroundColor,
        bodyComputedColor: bodyStyles.color,
        bodyBackgroundImage: bodyStyles.backgroundImage,
        htmlComputedBackground: htmlStyles.backgroundColor,
        themeRelatedRules: themeRules.slice(0, 20), // First 20 rules
        hasGlobalStyles: !!document.querySelector('style[data-vite-dev-id]'),
      };
    });

    console.log('CSS Analysis:');
    console.log('  Body inline style:', cssAnalysis.bodyInlineStyle);
    console.log('  HTML inline style:', cssAnalysis.htmlInlineStyle);
    console.log('  Body computed background:', cssAnalysis.bodyComputedBackground);
    console.log('  Body computed color:', cssAnalysis.bodyComputedColor);
    console.log('  Body background image:', cssAnalysis.bodyBackgroundImage);
    console.log('  HTML computed background:', cssAnalysis.htmlComputedBackground);
    console.log('  Has Vite dev styles:', cssAnalysis.hasGlobalStyles);
    console.log('\n  Theme-related CSS rules found:');
    cssAnalysis.themeRelatedRules.forEach((rule, idx) => {
      console.log(`    ${idx + 1}. ${rule.selector}`);
      console.log(`       ${rule.properties}`);
    });

    console.log('\n✅ Diagnostic complete! Check the screenshots and console output above.\n');

  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

diagnoseTheme();
