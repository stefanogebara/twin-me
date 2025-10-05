/**
 * Extract EXACT fonts and colors from claude.ai and anthropic.com
 * This will get the real Styrene and Tiempos fonts, not alternatives
 */

import { chromium } from 'playwright';
import fs from 'fs';

async function extractDesignSystem() {
  console.log('🔍 Extracting EXACT design system from Claude/Anthropic websites...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const designSystem = {
    claude: {},
    anthropic: {}
  };

  // ===== CLAUDE.AI =====
  console.log('📍 Inspecting https://claude.ai ...\n');

  try {
    await page.goto('https://claude.ai', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'claude-ai-screenshot.png', fullPage: false });

    // Extract ALL fonts used
    const claudeFonts = await page.evaluate(() => {
      const fonts = new Set();
      const fontFaces = new Map();

      // Get all computed styles
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const styles = window.getComputedStyle(el);
        if (styles.fontFamily) {
          fonts.add(styles.fontFamily);
        }
      });

      // Get @font-face declarations
      for (const sheet of document.styleSheets) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          for (const rule of rules) {
            if (rule instanceof CSSFontFaceRule) {
              const fontFamily = rule.style.fontFamily.replace(/['"]/g, '');
              const src = rule.style.src;
              const fontWeight = rule.style.fontWeight;
              const fontStyle = rule.style.fontStyle;

              if (!fontFaces.has(fontFamily)) {
                fontFaces.set(fontFamily, []);
              }

              fontFaces.get(fontFamily).push({
                src,
                weight: fontWeight,
                style: fontStyle
              });
            }
          }
        } catch (e) {
          // Skip cross-origin stylesheets
        }
      }

      // Get fonts from h1, h2, h3
      const headings = {};
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
        const el = document.querySelector(tag);
        if (el) {
          const styles = window.getComputedStyle(el);
          headings[tag] = {
            fontFamily: styles.fontFamily,
            fontSize: styles.fontSize,
            fontWeight: styles.fontWeight,
            lineHeight: styles.lineHeight,
            letterSpacing: styles.letterSpacing,
            color: styles.color
          };
        }
      });

      // Get body font
      const bodyStyles = window.getComputedStyle(document.body);
      const body = {
        fontFamily: bodyStyles.fontFamily,
        fontSize: bodyStyles.fontSize,
        fontWeight: bodyStyles.fontWeight,
        lineHeight: bodyStyles.lineHeight,
        color: bodyStyles.color,
        backgroundColor: bodyStyles.backgroundColor
      };

      return {
        allFonts: Array.from(fonts),
        fontFaces: Object.fromEntries(fontFaces),
        headings,
        body
      };
    });

    designSystem.claude.fonts = claudeFonts;

    // Extract colors
    const claudeColors = await page.evaluate(() => {
      const colors = {
        backgrounds: new Set(),
        text: new Set(),
        borders: new Set(),
        accents: new Set()
      };

      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const styles = window.getComputedStyle(el);

        if (styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          colors.backgrounds.add(styles.backgroundColor);
        }
        if (styles.color) {
          colors.text.add(styles.color);
        }
        if (styles.borderColor && styles.borderColor !== 'rgb(0, 0, 0)') {
          colors.borders.add(styles.borderColor);
        }
      });

      // Get CSS variables
      const rootStyles = window.getComputedStyle(document.documentElement);
      const cssVars = {};
      for (let i = 0; i < rootStyles.length; i++) {
        const prop = rootStyles[i];
        if (prop.startsWith('--')) {
          cssVars[prop] = rootStyles.getPropertyValue(prop).trim();
        }
      }

      return {
        backgrounds: Array.from(colors.backgrounds).slice(0, 20),
        text: Array.from(colors.text).slice(0, 20),
        borders: Array.from(colors.borders).slice(0, 20),
        cssVariables: cssVars
      };
    });

    designSystem.claude.colors = claudeColors;

    console.log('✅ Claude.ai extracted!\n');

  } catch (error) {
    console.error('❌ Error extracting from claude.ai:', error.message);
  }

  // ===== ANTHROPIC.COM =====
  console.log('📍 Inspecting https://www.anthropic.com ...\n');

  try {
    await page.goto('https://www.anthropic.com', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'anthropic-com-screenshot.png', fullPage: false });

    // Extract fonts
    const anthropicFonts = await page.evaluate(() => {
      const fonts = new Set();
      const fontFaces = new Map();

      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const styles = window.getComputedStyle(el);
        if (styles.fontFamily) {
          fonts.add(styles.fontFamily);
        }
      });

      // Get @font-face declarations
      for (const sheet of document.styleSheets) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          for (const rule of rules) {
            if (rule instanceof CSSFontFaceRule) {
              const fontFamily = rule.style.fontFamily.replace(/['"]/g, '');
              const src = rule.style.src;
              const fontWeight = rule.style.fontWeight;

              if (!fontFaces.has(fontFamily)) {
                fontFaces.set(fontFamily, []);
              }

              fontFaces.get(fontFamily).push({
                src,
                weight: fontWeight
              });
            }
          }
        } catch (e) {}
      }

      // Get heading fonts
      const headings = {};
      ['h1', 'h2', 'h3'].forEach(tag => {
        const el = document.querySelector(tag);
        if (el) {
          const styles = window.getComputedStyle(el);
          headings[tag] = {
            fontFamily: styles.fontFamily,
            fontSize: styles.fontSize,
            fontWeight: styles.fontWeight,
            lineHeight: styles.lineHeight,
            letterSpacing: styles.letterSpacing,
            color: styles.color
          };
        }
      });

      const bodyStyles = window.getComputedStyle(document.body);

      return {
        allFonts: Array.from(fonts),
        fontFaces: Object.fromEntries(fontFaces),
        headings,
        body: {
          fontFamily: bodyStyles.fontFamily,
          fontSize: bodyStyles.fontSize,
          backgroundColor: bodyStyles.backgroundColor,
          color: bodyStyles.color
        }
      };
    });

    designSystem.anthropic.fonts = anthropicFonts;

    // Extract colors
    const anthropicColors = await page.evaluate(() => {
      const colors = {
        backgrounds: new Set(),
        text: new Set(),
        borders: new Set()
      };

      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const styles = window.getComputedStyle(el);

        if (styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          colors.backgrounds.add(styles.backgroundColor);
        }
        if (styles.color) {
          colors.text.add(styles.color);
        }
        if (styles.borderColor && styles.borderColor !== 'rgb(0, 0, 0)') {
          colors.borders.add(styles.borderColor);
        }
      });

      // Get CSS variables
      const rootStyles = window.getComputedStyle(document.documentElement);
      const cssVars = {};
      for (let i = 0; i < rootStyles.length; i++) {
        const prop = rootStyles[i];
        if (prop.startsWith('--')) {
          cssVars[prop] = rootStyles.getPropertyValue(prop).trim();
        }
      }

      return {
        backgrounds: Array.from(colors.backgrounds).slice(0, 20),
        text: Array.from(colors.text).slice(0, 20),
        borders: Array.from(colors.borders).slice(0, 20),
        cssVariables: cssVars
      };
    });

    designSystem.anthropic.colors = anthropicColors;

    console.log('✅ Anthropic.com extracted!\n');

  } catch (error) {
    console.error('❌ Error extracting from anthropic.com:', error.message);
  }

  await browser.close();

  // Save results
  fs.writeFileSync('exact-design-system.json', JSON.stringify(designSystem, null, 2));

  console.log('\n📊 RESULTS:\n');
  console.log('='.repeat(80));

  // Print Claude fonts
  console.log('\n🎨 CLAUDE.AI FONTS:');
  console.log('-'.repeat(80));
  if (designSystem.claude.fonts) {
    console.log('\nHeadings:');
    Object.entries(designSystem.claude.fonts.headings || {}).forEach(([tag, styles]) => {
      console.log(`  ${tag}: ${styles.fontFamily}`);
      console.log(`      Size: ${styles.fontSize}, Weight: ${styles.fontWeight}`);
    });

    console.log('\nBody:');
    if (designSystem.claude.fonts.body) {
      console.log(`  ${designSystem.claude.fonts.body.fontFamily}`);
    }

    console.log('\nFont Faces Declared:');
    Object.entries(designSystem.claude.fonts.fontFaces || {}).forEach(([family, variants]) => {
      console.log(`  ${family}: ${variants.length} variants`);
    });
  }

  // Print Anthropic fonts
  console.log('\n🎨 ANTHROPIC.COM FONTS:');
  console.log('-'.repeat(80));
  if (designSystem.anthropic.fonts) {
    console.log('\nHeadings:');
    Object.entries(designSystem.anthropic.fonts.headings || {}).forEach(([tag, styles]) => {
      console.log(`  ${tag}: ${styles.fontFamily}`);
      console.log(`      Size: ${styles.fontSize}, Weight: ${styles.fontWeight}`);
    });

    console.log('\nBody:');
    if (designSystem.anthropic.fonts.body) {
      console.log(`  ${designSystem.anthropic.fonts.body.fontFamily}`);
    }

    console.log('\nFont Faces Declared:');
    Object.entries(designSystem.anthropic.fonts.fontFaces || {}).forEach(([family, variants]) => {
      console.log(`  ${family}: ${variants.length} variants`);
    });
  }

  // Print colors
  console.log('\n🎨 COLORS:');
  console.log('-'.repeat(80));
  console.log('\nClaude.ai backgrounds:', designSystem.claude.colors?.backgrounds.slice(0, 5));
  console.log('Anthropic.com backgrounds:', designSystem.anthropic.colors?.backgrounds.slice(0, 5));

  console.log('\n💾 Full data saved to: exact-design-system.json');
  console.log('📸 Screenshots saved: claude-ai-screenshot.png, anthropic-com-screenshot.png');

  return designSystem;
}

// Run extraction
extractDesignSystem().catch(console.error);
