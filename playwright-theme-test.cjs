const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'theme-test-screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
}

async function testThemeToggle() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const results = {
    themeToggleWorks: false,
    themeAttributeChanges: false,
    consoleErrors: [],
    pagesScanned: [],
    visibilityIssues: []
  };

  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
    }
  });

  try {
    console.log('\n=== Starting Theme Toggle Test ===\n');

    // Navigate to home page
    console.log('1. Navigating to http://localhost:8086');
    await page.goto('http://localhost:8086', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check initial theme
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    console.log(`   Initial theme: ${initialTheme || 'not set'}`);

    // Take initial screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, 'home-initial.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: home-initial.png');

    // Find theme toggle button
    console.log('\n2. Looking for theme toggle button...');

    // Try multiple selectors to find the toggle button
    let toggleButton = null;
    const selectors = [
      'button[aria-label*="theme"]',
      'button[aria-label*="Theme"]',
      'button[title*="theme"]',
      'button[title*="Theme"]',
      '[data-theme-toggle]',
      'button:has-text("Sun")',
      'button:has-text("Moon")',
      'svg.lucide-sun',
      'svg.lucide-moon',
      '.theme-toggle'
    ];

    for (const selector of selectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.count() > 0) {
          toggleButton = element;
          console.log(`   Found toggle button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!toggleButton) {
      // Try finding by parent structure (button containing sun/moon icon)
      toggleButton = await page.locator('button').filter({ has: page.locator('svg[class*="lucide"]') }).first();
      if (await toggleButton.count() > 0) {
        console.log('   Found toggle button by icon structure');
      }
    }

    if (toggleButton && await toggleButton.count() > 0) {
      console.log('   Toggle button found!');

      // Click the toggle button
      console.log('\n3. Clicking theme toggle button...');
      await toggleButton.click();
      await page.waitForTimeout(1000);

      // Check theme after toggle
      const afterToggleTheme = await page.evaluate(() => {
        return document.documentElement.getAttribute('data-theme');
      });
      console.log(`   Theme after toggle: ${afterToggleTheme || 'not set'}`);

      results.themeToggleWorks = true;
      results.themeAttributeChanges = initialTheme !== afterToggleTheme;

      // Take screenshot after first toggle
      await page.screenshot({
        path: path.join(screenshotsDir, 'home-after-toggle.png'),
        fullPage: true
      });
      console.log('   Screenshot saved: home-after-toggle.png');

      // Toggle back
      await toggleButton.click();
      await page.waitForTimeout(1000);

      const afterSecondToggle = await page.evaluate(() => {
        return document.documentElement.getAttribute('data-theme');
      });
      console.log(`   Theme after second toggle: ${afterSecondToggle || 'not set'}`);

    } else {
      console.log('   WARNING: Theme toggle button not found!');
    }

    // Test pages in both light and dark modes
    const pagesToTest = [
      { path: '/', name: 'home' },
      { path: '/get-started', name: 'get-started' },
      { path: '/twin-builder', name: 'twin-builder' }
    ];

    console.log('\n=== Testing Pages in Both Themes ===\n');

    for (const pageInfo of pagesToTest) {
      console.log(`\n--- Testing ${pageInfo.name} ---`);

      try {
        // Set to light mode
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'light');
        });
        await page.waitForTimeout(500);

        await page.goto(`http://localhost:8086${pageInfo.path}`, {
          waitUntil: 'networkidle',
          timeout: 10000
        });
        await page.waitForTimeout(2000);

        // Take light mode screenshot
        await page.screenshot({
          path: path.join(screenshotsDir, `${pageInfo.name}-light.png`),
          fullPage: true
        });
        console.log(`   Light mode screenshot saved: ${pageInfo.name}-light.png`);

        // Check for visibility issues in light mode
        const lightModeIssues = await checkTextVisibility(page, 'light', pageInfo.name);

        // Set to dark mode
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
        });
        await page.waitForTimeout(500);

        // Take dark mode screenshot
        await page.screenshot({
          path: path.join(screenshotsDir, `${pageInfo.name}-dark.png`),
          fullPage: true
        });
        console.log(`   Dark mode screenshot saved: ${pageInfo.name}-dark.png`);

        // Check for visibility issues in dark mode
        const darkModeIssues = await checkTextVisibility(page, 'dark', pageInfo.name);

        results.pagesScanned.push({
          page: pageInfo.name,
          lightModeIssues,
          darkModeIssues
        });

        if (lightModeIssues.length > 0 || darkModeIssues.length > 0) {
          results.visibilityIssues.push({
            page: pageInfo.name,
            lightMode: lightModeIssues,
            darkMode: darkModeIssues
          });
        }

      } catch (error) {
        console.log(`   ERROR accessing ${pageInfo.name}: ${error.message}`);
        results.pagesScanned.push({
          page: pageInfo.name,
          error: error.message
        });
      }
    }

  } catch (error) {
    console.error('\nTest failed with error:', error);
    results.error = error.message;
  } finally {
    await browser.close();
  }

  return results;
}

async function checkTextVisibility(page, mode, pageName) {
  const issues = [];

  console.log(`   Checking text visibility in ${mode} mode...`);

  // Get all text elements and their computed styles
  const textElements = await page.evaluate(() => {
    const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div, button, label');
    const results = [];

    elements.forEach((el, index) => {
      const text = el.textContent.trim();
      if (text && text.length > 0) {
        const styles = window.getComputedStyle(el);
        const color = styles.color;
        const backgroundColor = styles.backgroundColor;

        // Get parent background if element background is transparent
        let effectiveBackground = backgroundColor;
        if (backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
          let parent = el.parentElement;
          while (parent && (effectiveBackground === 'rgba(0, 0, 0, 0)' || effectiveBackground === 'transparent')) {
            effectiveBackground = window.getComputedStyle(parent).backgroundColor;
            parent = parent.parentElement;
          }
        }

        results.push({
          tag: el.tagName.toLowerCase(),
          text: text.substring(0, 50),
          color: color,
          backgroundColor: effectiveBackground,
          classes: el.className,
          id: el.id
        });
      }
    });

    return results;
  });

  // Check for potential visibility issues
  textElements.forEach(el => {
    // Check for hardcoded black color (#141413 or similar)
    if (el.color.includes('rgb(20, 20, 19)') || el.color.includes('#141413')) {
      issues.push({
        type: 'hardcoded-black',
        element: el.tag,
        text: el.text,
        color: el.color,
        classes: el.classes,
        id: el.id
      });
    }

    // Check for low contrast (both very dark or both very light)
    if (isLowContrast(el.color, el.backgroundColor)) {
      issues.push({
        type: 'low-contrast',
        element: el.tag,
        text: el.text,
        color: el.color,
        backgroundColor: el.backgroundColor,
        classes: el.classes,
        id: el.id
      });
    }
  });

  // Check for specific known issues
  const specificChecks = [
    'Connect Your Soul\'s Digital Canvas',
    'Discover Your Soul Signature',
    'Data Access Verification'
  ];

  for (const checkText of specificChecks) {
    const found = textElements.find(el => el.text.includes(checkText));
    if (found) {
      console.log(`   ✓ Found "${checkText}": color=${found.color}`);
      if (mode === 'dark' && !isLightColor(found.color)) {
        issues.push({
          type: 'dark-text-in-dark-mode',
          element: found.tag,
          text: found.text,
          color: found.color,
          backgroundColor: found.backgroundColor
        });
      }
    }
  }

  if (issues.length > 0) {
    console.log(`   ⚠ Found ${issues.length} visibility issues in ${mode} mode`);
  } else {
    console.log(`   ✓ No major visibility issues found in ${mode} mode`);
  }

  return issues;
}

function isLowContrast(color, backgroundColor) {
  // Simple contrast check - could be improved
  const colorLuminance = getColorLuminance(color);
  const bgLuminance = getColorLuminance(backgroundColor);

  if (colorLuminance === null || bgLuminance === null) return false;

  const contrast = Math.abs(colorLuminance - bgLuminance);
  return contrast < 0.3; // Low contrast threshold
}

function isLightColor(color) {
  const luminance = getColorLuminance(color);
  return luminance !== null && luminance > 0.5;
}

function getColorLuminance(color) {
  if (!color || color === 'transparent') return null;

  // Extract RGB values
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;

  const r = parseInt(match[1]) / 255;
  const g = parseInt(match[2]) / 255;
  const b = parseInt(match[3]) / 255;

  // Calculate relative luminance
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Run the test
(async () => {
  const results = await testThemeToggle();

  console.log('\n\n=== TEST RESULTS SUMMARY ===\n');
  console.log(`Theme toggle button works: ${results.themeToggleWorks ? '✓ YES' : '✗ NO'}`);
  console.log(`Theme attribute changes: ${results.themeAttributeChanges ? '✓ YES' : '✗ NO'}`);
  console.log(`Console errors: ${results.consoleErrors.length}`);

  if (results.consoleErrors.length > 0) {
    console.log('\nConsole Errors:');
    results.consoleErrors.forEach(err => console.log(`  - ${err}`));
  }

  console.log(`\nPages scanned: ${results.pagesScanned.length}`);
  results.pagesScanned.forEach(page => {
    if (page.error) {
      console.log(`  ✗ ${page.page}: ${page.error}`);
    } else {
      console.log(`  ✓ ${page.page}: ${page.lightModeIssues.length} light mode issues, ${page.darkModeIssues.length} dark mode issues`);
    }
  });

  if (results.visibilityIssues.length > 0) {
    console.log('\n=== VISIBILITY ISSUES FOUND ===\n');
    results.visibilityIssues.forEach(page => {
      console.log(`\n${page.page.toUpperCase()}:`);

      if (page.lightMode.length > 0) {
        console.log('  Light Mode Issues:');
        page.lightMode.forEach(issue => {
          console.log(`    - ${issue.type}: <${issue.element}> "${issue.text}"`);
          console.log(`      Color: ${issue.color}, BG: ${issue.backgroundColor}`);
          if (issue.classes) console.log(`      Classes: ${issue.classes}`);
        });
      }

      if (page.darkMode.length > 0) {
        console.log('  Dark Mode Issues:');
        page.darkMode.forEach(issue => {
          console.log(`    - ${issue.type}: <${issue.element}> "${issue.text}"`);
          console.log(`      Color: ${issue.color}, BG: ${issue.backgroundColor}`);
          if (issue.classes) console.log(`      Classes: ${issue.classes}`);
        });
      }
    });
  } else {
    console.log('\n✓ No significant visibility issues found!');
  }

  // Save results to JSON
  const resultsPath = path.join(__dirname, 'theme-test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n\nDetailed results saved to: ${resultsPath}`);
  console.log(`Screenshots saved to: ${screenshotsDir}`);
})();
