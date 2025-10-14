// Simple script to create basic extension icons using Canvas
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple SVG icon and save as PNG using data URL
const createIcon = (size) => {
  // Create SVG with Soul Signature branding
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#D97706"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
            font-family="Arial" font-size="${size * 0.5}" fill="white" font-weight="bold">
        SS
      </text>
    </svg>
  `;

  // For now, save as SVG (Chrome supports SVG icons)
  const iconPath = path.join(__dirname, 'icons', `icon${size}.svg`);
  fs.writeFileSync(iconPath, svg.trim());
  console.log(`Created ${iconPath}`);
};

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

// Create icons
createIcon(16);
createIcon(48);
createIcon(128);

console.log('Icons created successfully!');
