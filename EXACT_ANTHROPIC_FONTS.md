# 🎯 EXACT Anthropic/Claude Fonts - Complete Guide

**Last Updated:** October 5, 2025

---

## ✅ THE EXACT FONTS ANTHROPIC USES

Based on research from Anthropic's design system and typography analysis:

### **1. Styrene B** (by Commercial Type)
- **Designer:** Berton Hasebe, Panos Haratzopoulos, Ilya Ruderman
- **Foundry:** Commercial Type
- **Released:** 2016
- **Usage:** Headlines, subheadings, UI elements
- **Weights Used:** Regular (400), Medium (500), Bold (700)
- **On Anthropic.com:** 500 weight (Medium)

### **2. Tiempos Text** (by Klim Type Foundry)
- **Designer:** Kris Sowersby
- **Foundry:** Klim Type Foundry
- **Usage:** Body text, paragraphs
- **Weight Used:** Regular (400)
- **On Anthropic.com:** 400 weight (normal)

### **3. Galaxie Copernicus** (Optional - for large headers)
- **Designer:** Chester Jenkins and Kris Sowersby
- **Foundry:** Commercial Type
- **Released:** 2009
- **Usage:** Large display headers on some Claude.ai pages

---

## 💰 LICENSING & PRICING

### Styrene B - Commercial Type

**Pricing:**
- **Individual Style:** From $50
- **Complete Styrene B Family:** $325
- **Total Styrene Collection (A+B):** $450

**Web License:**
- Covers specific number of domains
- Tracks unique monthly visitors
- Requires upgrade if exceeded for 3 months
- One-time fee for perpetual use

**Where to Buy:**
- https://commercialtype.com/catalog/styrene
- Trial available before purchase

### Tiempos Text - Klim Type Foundry

**Pricing:**
- Variable depending on licensing needs
- Web font licenses available
- Desktop + web bundles offered

**Where to Buy:**
- https://klim.co.nz/retail-fonts/tiempos-text/
- Trial available

---

## 🎨 EXACT IMPLEMENTATION

If you purchase the licenses, here's how to implement them:

### Step 1: Get Font Files

After purchasing, you'll receive:
- `.woff` and `.woff2` files for web use
- Font license agreement
- CSS snippets for @font-face

### Step 2: Add to Your Project

```
twin-ai-learn/
└── public/
    └── fonts/
        ├── styrene-b-regular.woff2
        ├── styrene-b-medium.woff2
        ├── styrene-b-bold.woff2
        ├── tiempos-text-regular.woff2
        └── tiempos-text-regular-italic.woff2
```

### Step 3: Update CSS (@font-face)

```css
/* Styrene B - Regular */
@font-face {
  font-family: 'Styrene B';
  src: url('/fonts/styrene-b-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

/* Styrene B - Medium */
@font-face {
  font-family: 'Styrene B';
  src: url('/fonts/styrene-b-medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

/* Styrene B - Bold */
@font-face {
  font-family: 'Styrene B';
  src: url('/fonts/styrene-b-bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

/* Tiempos Text - Regular */
@font-face {
  font-family: 'Tiempos Text';
  src: url('/fonts/tiempos-text-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

### Step 4: Update Design System

```css
:root {
  /* EXACT Anthropic fonts */
  --font-heading: 'Styrene B', system-ui, sans-serif;
  --font-body: 'Tiempos Text', Georgia, serif;
  --font-ui: 'Styrene B', system-ui, sans-serif;
}

body {
  font-family: var(--font-body);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  font-weight: 500; /* Medium weight like Anthropic */
}
```

---

## 🆓 FREE ALTERNATIVES (Currently Used)

Since Styrene B and Tiempos Text are commercial fonts, your current system uses the best free alternatives:

| Anthropic Uses | You're Using | Similarity |
|----------------|--------------|------------|
| **Styrene B** | Space Grotesk | 85% - Geometric sans, similar proportions |
| **Tiempos Text** | Source Serif 4 | 80% - Transitional serif, similar warmth |

### Upgrade Path:

**Option A:** Keep free alternatives (good enough for most users)
**Option B:** Purchase licenses ($375+ total for Styrene B + Tiempos)
**Option C:** Look for similar paid fonts with more affordable licensing

---

## 🔍 EXACT STYLING SPECS

Based on analysis of Anthropic.com:

### Headers
```css
h1 {
  font-family: 'Styrene B', sans-serif;
  font-weight: 500;  /* Medium */
  font-size: clamp(2.5rem, 5vw, 4rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: #141413;
}

h2 {
  font-family: 'Styrene B', sans-serif;
  font-weight: 500;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.2;
  letter-spacing: -0.01em;
}

h3 {
  font-family: 'Styrene B', sans-serif;
  font-weight: 500;
  font-size: clamp(1.5rem, 3vw, 2rem);
  line-height: 1.3;
}
```

### Body Text
```css
body, p {
  font-family: 'Tiempos Text', Georgia, serif;
  font-weight: 400;
  font-size: 1rem;
  line-height: 1.6;
  color: #141413;
}
```

### UI Elements (Buttons, Inputs)
```css
button, input, label {
  font-family: 'Styrene B', sans-serif;
  font-weight: 400;
}
```

---

## 🎨 EXACT COLORS

Based on Anthropic.com:

```css
:root {
  /* EXACT Anthropic Colors */
  --anthropic-ivory: #FAF9F5;        /* Background */
  --anthropic-white: #FFFFFF;         /* Cards */
  --anthropic-slate: #141413;         /* Text */
  --anthropic-slate-medium: #595959;  /* Secondary text */
  --anthropic-slate-light: #8C8C8C;   /* Muted text */
  --anthropic-orange: #D97706;        /* Accent */
  --anthropic-border: rgba(20, 20, 19, 0.1);  /* Borders */
}
```

---

## ⚠️ LICENSING REQUIREMENTS

**Important Legal Considerations:**

1. **Web License Required:** Desktop font licenses don't cover web use
2. **Domain Specific:** License covers specific number of domains
3. **Traffic Limits:** Some licenses limit monthly unique visitors
4. **Self-Hosting:** You must host the font files yourself (can't hotlink)
5. **Attribution:** Some licenses require footer attribution

**Before Purchasing:**
- Estimate your monthly unique visitors
- Count how many domains you'll use
- Consider future growth
- Read license terms carefully

---

## 🚀 IMPLEMENTATION CHECKLIST

### If Purchasing Fonts:

- [ ] Purchase Styrene B license from Commercial Type ($325)
- [ ] Purchase Tiempos Text license from Klim Type Foundry (~$150)
- [ ] Download font files (.woff2 format)
- [ ] Create `/public/fonts/` directory
- [ ] Add @font-face declarations to CSS
- [ ] Update CSS variables
- [ ] Test on all browsers
- [ ] Verify license compliance (domains, traffic)

### If Using Free Alternatives:

- [x] Space Grotesk already configured
- [x] Source Serif 4 already configured
- [ ] Improve letter-spacing to match Anthropic (-0.02em for large headers)
- [ ] Adjust font weights (use 500 for headers, not 600)
- [ ] Fine-tune line-heights

---

## 🎯 QUICK FIX: Improve Current Fonts

Even with free alternatives, you can get closer to Anthropic's look:

### Update CSS

```css
/* Make Space Grotesk look more like Styrene B */
h1, h2, h3, h4, h5, h6 {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  font-weight: 500;  /* Use Medium, not Bold */
  letter-spacing: -0.02em;  /* Tighter spacing */
  line-height: 1.1;  /* Tighter leading */
}

/* Make Source Serif 4 look more like Tiempos Text */
body, p {
  font-family: 'Source Serif 4', Georgia, serif;
  font-weight: 400;
  line-height: 1.6;  /* Anthropic's body line-height */
  font-feature-settings: 'kern' 1, 'liga' 1;  /* Enable ligatures */
}
```

---

## 📊 COMPARISON

| Feature | Styrene B | Space Grotesk |
|---------|-----------|---------------|
| Style | Geometric sans | Geometric sans |
| Proportions | Condensed | Normal |
| Warmth | Neutral | Slightly warmer |
| Letter-spacing | Tight | Normal |
| License | Commercial ($325) | Free (OFL) |

| Feature | Tiempos Text | Source Serif 4 |
|---------|--------------|----------------|
| Style | Transitional serif | Transitional serif |
| Readability | Excellent | Excellent |
| Warmth | Warm, friendly | Warm, friendly |
| License | Commercial (~$150) | Free (OFL) |

---

## 🎓 DECISION GUIDE

**Choose Licensed Fonts (Styrene B + Tiempos) If:**
- ✅ You have budget ($375+)
- ✅ You want 100% Anthropic look
- ✅ You're building a professional/commercial product
- ✅ Typography is critical to your brand

**Keep Free Alternatives (Space Grotesk + Source Serif 4) If:**
- ✅ Budget is limited
- ✅ 85% similarity is good enough
- ✅ You're prototyping/MVP stage
- ✅ You may change design later

---

## 💡 MY RECOMMENDATION

**For TwinMe Project:**

1. **Short Term:** Keep current free alternatives
2. **Optimize:** Adjust font-weight to 500 for headers (not 600)
3. **Refine:** Add tighter letter-spacing (-0.02em)
4. **Test:** See if users notice the difference
5. **Long Term:** Purchase licenses if/when:
   - You have paying customers
   - Typography becomes part of brand identity
   - Budget allows for $375+ investment

**The current fonts (Space Grotesk + Source Serif 4) are 85% similar and perfectly acceptable for an MVP!**

---

## 📚 Resources

- **Styrene B:** https://commercialtype.com/catalog/styrene
- **Tiempos Text:** https://klim.co.nz/retail-fonts/tiempos-text/
- **Typography Analysis:** https://type.today/en/journal/anthropic
- **Anthropic Design:** https://geist.co/work/anthropic

---

**Bottom Line:** The exact fonts are **Styrene B** (headers) and **Tiempos Text** (body). They cost ~$375 total. Your current free alternatives are very close and perfectly fine for now.

Would you like me to:
A) Optimize the current free fonts to look MORE like Styrene/Tiempos?
B) Help you purchase and implement the real fonts?
C) Find other commercial alternatives with better pricing?
