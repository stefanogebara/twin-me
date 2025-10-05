/**
 * Playwright Design Audit Script
 * Checks for design inconsistencies across the TwinMe website
 */

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8086';
const SCREENSHOTS_DIR = './design-audit-screenshots';

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function auditWebsite() {
  console.log('🎨 Starting TwinMe Design Audit...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const issues = [];
  const colorUsage = new Map();
  const fontUsage = new Map();

  // Pages to audit
  const pages = [
    { url: '/', name: 'Homepage' },
    { url: '/auth', name: 'Auth Page' },
    { url: '/get-started', name: 'Get Started' },
    { url: '/twin-builder', name: 'Twin Builder' },
    { url: '/watch-demo', name: 'Watch Demo' },
    { url: '/contact', name: 'Contact' }
  ];

  for (const pageInfo of pages) {
    console.log(`\n📄 Auditing: ${pageInfo.name} (${pageInfo.url})`);

    try {
      await page.goto(`${BASE_URL}${pageInfo.url}`, {
        waitUntil: 'networkidle',
        timeout: 10000
      });

      // Take screenshot
      const screenshotPath = path.join(SCREENSHOTS_DIR, `${pageInfo.name.replace(/\s+/g, '-')}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`   ✅ Screenshot: ${screenshotPath}`);

      // Extract all colors used
      const colors = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        const colors = new Set();

        allElements.forEach(el => {
          const styles = window.getComputedStyle(el);

          // Background colors
          if (styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
            colors.add(styles.backgroundColor);
          }

          // Text colors
          if (styles.color) {
            colors.add(styles.color);
          }

          // Border colors
          if (styles.borderColor && styles.borderColor !== 'rgb(0, 0, 0)') {
            colors.add(styles.borderColor);
          }
        });

        return Array.from(colors);
      });

      colors.forEach(color => {
        const count = colorUsage.get(color) || 0;
        colorUsage.set(color, count + 1);
      });

      console.log(`   🎨 Colors found: ${colors.length}`);

      // Extract all fonts used
      const fonts = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        const fonts = new Set();

        allElements.forEach(el => {
          const styles = window.getComputedStyle(el);
          if (styles.fontFamily) {
            fonts.add(styles.fontFamily);
          }
        });

        return Array.from(fonts);
      });

      fonts.forEach(font => {
        const count = fontUsage.get(font) || 0;
        fontUsage.set(font, count + 1);
      });

      console.log(`   📝 Fonts found: ${fonts.length}`);

      // Check for specific design issues
      const designIssues = await page.evaluate(() => {
        const issues = [];

        // Check for inconsistent spacing
        const buttons = document.querySelectorAll('button');
        const buttonPaddings = new Set();
        buttons.forEach(btn => {
          const styles = window.getComputedStyle(btn);
          buttonPaddings.add(`${styles.paddingTop} ${styles.paddingRight} ${styles.paddingBottom} ${styles.paddingLeft}`);
        });
        if (buttonPaddings.size > 5) {
          issues.push(`Inconsistent button padding: ${buttonPaddings.size} different variations`);
        }

        // Check for multiple heading styles
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const headingColors = new Set();
        const headingFonts = new Set();
        headings.forEach(h => {
          const styles = window.getComputedStyle(h);
          headingColors.add(styles.color);
          headingFonts.add(styles.fontFamily);
        });
        if (headingColors.size > 3) {
          issues.push(`Too many heading colors: ${headingColors.size} different colors`);
        }
        if (headingFonts.size > 2) {
          issues.push(`Inconsistent heading fonts: ${headingFonts.size} different fonts`);
        }

        // Check for card consistency
        const cards = document.querySelectorAll('[class*="card"], [class*="Card"]');
        const cardBackgrounds = new Set();
        const cardBorders = new Set();
        cards.forEach(card => {
          const styles = window.getComputedStyle(card);
          cardBackgrounds.add(styles.backgroundColor);
          cardBorders.add(styles.borderColor);
        });
        if (cardBackgrounds.size > 3) {
          issues.push(`Inconsistent card backgrounds: ${cardBackgrounds.size} variations`);
        }

        // Check for border radius consistency
        const elementsWithBorder = document.querySelectorAll('button, input, [class*="card"], [class*="Card"]');
        const borderRadii = new Set();
        elementsWithBorder.forEach(el => {
          const styles = window.getComputedStyle(el);
          if (styles.borderRadius !== '0px') {
            borderRadii.add(styles.borderRadius);
          }
        });
        if (borderRadii.size > 4) {
          issues.push(`Too many border radius values: ${borderRadii.size} different radii`);
        }

        // Check for missing alt text on images
        const images = document.querySelectorAll('img');
        let missingAlt = 0;
        images.forEach(img => {
          if (!img.alt || img.alt.trim() === '') {
            missingAlt++;
          }
        });
        if (missingAlt > 0) {
          issues.push(`${missingAlt} images missing alt text (accessibility issue)`);
        }

        return issues;
      });

      if (designIssues.length > 0) {
        console.log(`   ⚠️  Issues found:`);
        designIssues.forEach(issue => {
          console.log(`      - ${issue}`);
          issues.push({ page: pageInfo.name, issue });
        });
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      issues.push({ page: pageInfo.name, issue: `Navigation failed: ${error.message}` });
    }
  }

  // Generate report
  console.log('\n\n📊 DESIGN AUDIT REPORT');
  console.log('=' .repeat(80));

  console.log('\n🎨 COLOR PALETTE ANALYSIS');
  console.log('-'.repeat(80));
  const sortedColors = Array.from(colorUsage.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20); // Top 20 colors

  sortedColors.forEach(([color, count]) => {
    console.log(`   ${color.padEnd(40)} - Used ${count} times`);
  });

  if (colorUsage.size > 30) {
    console.log(`\n   ⚠️  WARNING: ${colorUsage.size} different colors detected!`);
    console.log(`   👉 Consider using a consistent color palette (Claude's design system has ~8 colors)`);
  }

  console.log('\n📝 FONT FAMILY ANALYSIS');
  console.log('-'.repeat(80));
  const sortedFonts = Array.from(fontUsage.entries())
    .sort((a, b) => b[1] - a[1]);

  sortedFonts.forEach(([font, count]) => {
    console.log(`   ${font.substring(0, 60).padEnd(60)} - Used ${count} times`);
  });

  if (fontUsage.size > 5) {
    console.log(`\n   ⚠️  WARNING: ${fontUsage.size} different font families detected!`);
    console.log(`   👉 Stick to 2-3 font families maximum for consistency`);
  }

  console.log('\n⚠️  DESIGN ISSUES FOUND');
  console.log('-'.repeat(80));
  if (issues.length === 0) {
    console.log('   ✅ No major issues detected!');
  } else {
    const groupedIssues = {};
    issues.forEach(({ page, issue }) => {
      if (!groupedIssues[page]) {
        groupedIssues[page] = [];
      }
      groupedIssues[page].push(issue);
    });

    Object.entries(groupedIssues).forEach(([page, pageIssues]) => {
      console.log(`\n   📄 ${page}:`);
      pageIssues.forEach(issue => {
        console.log(`      - ${issue}`);
      });
    });
  }

  // Save detailed report to file
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPages: pages.length,
      totalColors: colorUsage.size,
      totalFonts: fontUsage.size,
      totalIssues: issues.length
    },
    colors: Object.fromEntries(sortedColors),
    fonts: Object.fromEntries(sortedFonts),
    issues: issues,
    recommendations: []
  };

  // Add recommendations
  if (colorUsage.size > 30) {
    report.recommendations.push('Create a standardized color palette with max 8-10 colors');
  }
  if (fontUsage.size > 5) {
    report.recommendations.push('Reduce font families to 2-3 maximum');
  }
  if (issues.some(i => i.issue.includes('button padding'))) {
    report.recommendations.push('Standardize button padding across all components');
  }
  if (issues.some(i => i.issue.includes('border radius'))) {
    report.recommendations.push('Use consistent border radius values (e.g., 4px, 8px, 16px only)');
  }

  fs.writeFileSync(
    './design-audit-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('\n\n💾 Detailed report saved to: design-audit-report.json');
  console.log(`📸 Screenshots saved to: ${SCREENSHOTS_DIR}/`);

  console.log('\n\n✅ Design audit complete!');
  console.log('=' .repeat(80));

  await browser.close();
  return report;
}

// Run the audit
auditWebsite().catch(console.error);
