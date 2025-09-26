# 🎨 COLOR CONSISTENCY CHECKLIST

## ⚠️ MANDATORY - Check Every Single Time Before Completing Any UI Work

### 1. **Text Color Audit**
- [ ] Search for `text-white` - Replace with proper color variables
- [ ] Search for `text-black` - Replace with `var(--_color-theme---text)`
- [ ] Search for `text-gray-` - Replace with `var(--_color-theme---text-secondary)`
- [ ] Search for hardcoded colors like `#000`, `#fff`, `#333`, etc.

### 2. **Background Color Audit**
- [ ] Search for `bg-white` - Replace with `var(--_color-theme---surface)`
- [ ] Search for `bg-black` - Replace with `var(--_color-theme---background)`
- [ ] Search for `bg-gray-` - Replace with appropriate theme variables
- [ ] Check card backgrounds use `var(--_color-theme---surface)`

### 3. **Border Color Audit**
- [ ] Search for `border-white`, `border-black`, `border-gray-`
- [ ] Replace with `var(--_color-theme---border)`
- [ ] Check accent borders use `var(--_color-theme---accent)`

### 4. **Step Indicators & Navigation**
- [ ] Verify all step numbers are visible
- [ ] Check active/inactive states have proper contrast
- [ ] Ensure consistent styling across all steps
- [ ] Verify hover states are visible

### 5. **Button Text Visibility**
- [ ] Check all button text is visible against background
- [ ] Verify Connect/Submit buttons have proper contrast
- [ ] Test hover states for visibility

### 6. **Anthropic Color Variables to Use**
```css
--_color-theme---background        /* Main background */
--_color-theme---surface          /* Card backgrounds */
--_color-theme---border           /* Borders */
--_color-theme---text             /* Primary text */
--_color-theme---text-secondary   /* Secondary text */
--_color-theme---accent           /* Orange accent */
--_color-theme---background-secondary /* Subtle backgrounds */
```

### 7. **Final Visual Test**
- [ ] Test on dark backgrounds - can you see all text?
- [ ] Test step indicators - are all numbers visible?
- [ ] Test button text - is "Connect" visible?
- [ ] Test description text consistency
- [ ] Check badge/pill text visibility

## 🔧 Search Commands to Run
```bash
# Find hardcoded colors
grep -r "text-white\|text-black\|text-gray\|bg-white\|bg-black\|bg-gray" src/
grep -r "#[0-9a-fA-F]{3,6}" src/
```

## ❌ Never Use These Classes
- `text-white` (unless on colored background with `color: white`)
- `text-black`
- `text-gray-*`
- `bg-white`
- `bg-black`
- `bg-gray-*`

## ✅ Always Use These Instead
- `style={{ color: 'var(--_color-theme---text)' }}`
- `style={{ color: 'var(--_color-theme---text-secondary)' }}`
- `style={{ backgroundColor: 'var(--_color-theme---surface)' }}`

---

**🚨 DO NOT MARK ANY UI TASK COMPLETE WITHOUT RUNNING THIS CHECKLIST**