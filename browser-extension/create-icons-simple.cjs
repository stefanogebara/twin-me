/**
 * Create simple SVG icons for the extension
 * These are placeholder icons - can be replaced with proper designs later
 */

const fs = require('fs');
const path = require('path');

// Ensure assets directory exists
const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Create SVG icons with different sizes
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#D97706" rx="${size / 8}"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.6}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">S</text>
</svg>`;

  const filename = `icon-${size}.svg`;
  const filepath = path.join(assetsDir, filename);

  fs.writeFileSync(filepath, svg);
  console.log(`✓ Created ${filename}`);
});

console.log('\n✅ All icons created successfully!');
console.log('Note: SVG icons will work for the extension. For production, convert to PNG.');
