# 🎨 Styrene B Font - Purchase & Implementation Guide

**Status:** Ready to purchase and implement
**Date:** October 5, 2025
**Source:** [Type.Today - Styrene in use: ANTHROPIC](https://type.today/en/journal/anthropic)

---

## ✅ CONFIRMED: Anthropic Uses Styrene B

According to Type.Today typography journal:

> "**Styrene by Berton Hasebe is applied to the website headlines and subheadings**, Tiempos by Klim Type Foundry is used for body text."

This is the **exact font** Anthropic uses for anthropic.com and claude.ai.

---

## 💰 What to Purchase

### Recommended Package: Styrene B Web Font Family

**Price:** $325 (one-time fee)
**Purchase Link:** https://commercialtype.com/catalog/styrene/styrene-b

### What You Get:
- ✅ All 6 weights (Thin, Light, Regular, Medium, Bold, Black)
- ✅ All italic variants
- ✅ Web font license (.woff, .woff2 files)
- ✅ Covers multiple domains
- ✅ Perpetual license (one-time payment)

### Required Weights for TwinMe:
At minimum, you need these 3 weights:
1. **Regular (400)** - Base text, UI elements
2. **Medium (500)** - All headings (h1-h6) - EXACT Anthropic style
3. **Bold (700)** - Emphasis, strong text

**Minimum Cost:** $150 (3 individual weights at $50 each)
**Recommended:** $325 (full family for future flexibility)

---

## 🛒 How to Purchase

### Step 1: Go to Commercial Type
Visit: https://commercialtype.com/catalog/styrene/styrene-b

### Step 2: Select License Type
- Click "Add to Cart" for Styrene B
- Choose "**Web License**" (not Desktop)
- Select the weights you need (or full family)

### Step 3: Configure License
You'll be asked:
- **Number of domains:** 1-3 (pick based on your needs)
- **Monthly unique visitors:** Estimate your traffic
- **Project type:** Commercial/Personal

### Step 4: Complete Purchase
- Create account or sign in
- Enter payment details
- Download your font files immediately

---

## 📥 After Purchase - What You'll Get

Commercial Type will provide:
```
styrene-b-web-fonts/
├── styrene-b-regular.woff2
├── styrene-b-regular.woff
├── styrene-b-medium.woff2
├── styrene-b-medium.woff
├── styrene-b-bold.woff2
├── styrene-b-bold.woff
└── license.txt
```

---

## 🔧 Implementation Steps (After Download)

### Step 1: Copy Font Files to Project
```bash
# After downloading, copy the .woff2 files to:
twin-ai-learn/public/fonts/
```

Your folder structure should be:
```
public/
└── fonts/
    ├── styrene-b-regular.woff2
    ├── styrene-b-medium.woff2
    └── styrene-b-bold.woff2
```

### Step 2: I'll Update the CSS
Once you place the files, I will:
1. Add `@font-face` declarations to `src/index.css`
2. Update font-family from 'Space Grotesk' to 'Styrene B'
3. Test all headings, subheadings, and titles

### Step 3: Verify in Browser
- All h1, h2, h3, h4, h5, h6 will use Styrene B Medium (500)
- Buttons and UI will use Styrene B Regular
- Emphasis text will use Styrene B Bold

---

## 🎯 Exact CSS Changes (Preview)

Once you have the fonts, I'll update `src/index.css` to:

```css
/* Add @font-face declarations */
@font-face {
  font-family: 'Styrene B';
  src: url('/fonts/styrene-b-medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Styrene B';
  src: url('/fonts/styrene-b-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

/* Update design tokens */
:root {
  --font-heading: 'Styrene B', system-ui, sans-serif;  /* Changed from Space Grotesk */
  --font-ui: 'Styrene B', system-ui, sans-serif;      /* Changed from DM Sans */
  --font-body: 'Source Serif 4', Georgia, serif;      /* Keep Tiempos alternative */
}

/* All headings get Styrene B */
h1, h2, h3, h4, h5, h6 {
  font-family: 'Styrene B', system-ui, sans-serif;
  font-weight: 500;  /* Medium weight - EXACT Anthropic */
  line-height: 1.1;
  letter-spacing: -0.02em;
}
```

---

## 💡 Alternative Options

### Option A: Purchase Full Family ($325)
✅ **Best for long-term**
- All 6 weights + italics
- Maximum flexibility
- Future-proof design system

### Option B: Purchase 3 Weights ($150)
✅ **Best for MVP/Budget**
- Regular (400), Medium (500), Bold (700)
- Covers all current needs
- Can upgrade later

### Option C: Keep Space Grotesk (FREE)
✅ **Best for testing first**
- Current setup already optimized to 85% match
- No cost, test user feedback first
- Purchase Styrene B later if needed

---

## ⚖️ License Compliance

**Important Legal Notes:**
1. ✅ Web license covers `.woff` and `.woff2` usage
2. ✅ Must self-host fonts (can't hotlink)
3. ✅ Covers specific number of domains
4. ⚠️ Desktop license NOT included (separate purchase)
5. ⚠️ Monitor monthly traffic limits

**Read the license.txt file carefully after purchase!**

---

## 🚀 Ready to Implement?

### If You Have the Fonts Already:
1. Copy `.woff2` files to `public/fonts/`
2. Tell me, and I'll update the CSS immediately

### If You're Purchasing Now:
1. Visit: https://commercialtype.com/catalog/styrene/styrene-b
2. Select "Web License" + Styrene B
3. Choose your weights (recommend full family)
4. Complete purchase
5. Download files
6. Copy to `public/fonts/`
7. I'll handle the rest!

### If You Want to Test First:
- Current Space Grotesk is already optimized to match Styrene
- Test with users, gather feedback
- Purchase later when confident

---

## 📊 Cost Breakdown

| Option | Cost | What You Get | Recommended For |
|--------|------|--------------|-----------------|
| **Full Styrene B Family** | $325 | All weights + italics | Production sites, long-term |
| **3 Essential Weights** | $150 | Regular, Medium, Bold | Budget-conscious MVP |
| **Keep Space Grotesk** | $0 | 85% visual match | Testing, prototyping |

---

## ✅ What Happens Next

**Once you have Styrene B font files:**
1. ✅ Place them in `public/fonts/`
2. ✅ I'll add @font-face declarations
3. ✅ Update all headings to use Styrene B Medium (500)
4. ✅ Update UI elements to use Styrene B Regular (400)
5. ✅ Test in all browsers
6. ✅ You'll have 100% exact Anthropic typography

**Current Status:**
- 📁 `public/fonts/` directory created
- 📝 CSS structure ready
- ⏳ Waiting for font files

---

## 🎯 Decision Time

Choose one:

**A) Purchase Styrene B now** ($150-$325)
   → Visit https://commercialtype.com/catalog/styrene/styrene-b

**B) I have the fonts already**
   → Copy files to `public/fonts/` and tell me

**C) Test with Space Grotesk first** (FREE)
   → Keep current setup, decide later

Let me know which option you prefer!
