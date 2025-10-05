/**
 * Theme Toggle Test Script
 * Tests the theme toggle functionality on Twin AI Learn platform
 */

const http = require('http');

// Simple function to check if server is running
function checkServer(url, callback) {
  http.get(url, (res) => {
    callback(res.statusCode === 200);
  }).on('error', () => {
    callback(false);
  });
}

// Test configuration
const tests = {
  frontendUrl: 'http://localhost:8086',
  backendUrl: 'http://localhost:3001',

  async runTests() {
    console.log('🧪 Theme Toggle Test Suite\n');
    console.log('=' .repeat(50));

    // Check if servers are running
    console.log('\n📡 Checking servers...');

    checkServer(this.frontendUrl, (frontendRunning) => {
      console.log(`Frontend (${this.frontendUrl}): ${frontendRunning ? '✅ Running' : '❌ Not running'}`);

      checkServer(this.backendUrl, (backendRunning) => {
        console.log(`Backend (${this.backendUrl}): ${backendRunning ? '✅ Running' : '⚠️  Not running (optional for frontend tests)'}`);

        if (!frontendRunning) {
          console.log('\n❌ Frontend is not running. Please start it with: npm run dev');
          process.exit(1);
        }

        console.log('\n✅ Servers are accessible');
        console.log('\n' + '=' .repeat(50));
        console.log('\n🎨 Manual Testing Instructions:\n');

        console.log('1. THEME TOGGLE BUTTON TEST:');
        console.log('   • Navigate to: http://localhost:8086');
        console.log('   • Look for Sun/Moon icon button in top-right navigation');
        console.log('   • Expected: Button should be visible and styled\n');

        console.log('2. THEME SWITCHING TEST (Home Page):');
        console.log('   • Open browser DevTools (F12)');
        console.log('   • In Console tab, run: document.documentElement.getAttribute("data-theme")');
        console.log('   • Click the theme toggle button');
        console.log('   • Run the command again');
        console.log('   • Expected: Theme should change from "light" to "dark" (or vice versa)\n');

        console.log('3. VISUAL VERIFICATION (Home Page - Light Mode):');
        console.log('   • Ensure theme is set to "light"');
        console.log('   • Check: Background should be cream/white (#FFF3EA)');
        console.log('   • Check: "Discover Your Soul Signature" heading is visible');
        console.log('   • Check: Navigation links are dark and readable');
        console.log('   • Check: All text is readable (no white on white)\n');

        console.log('4. VISUAL VERIFICATION (Home Page - Dark Mode):');
        console.log('   • Click theme toggle to switch to dark mode');
        console.log('   • Check: Background should be dark (#111319)');
        console.log('   • Check: "Discover Your Soul Signature" heading is light colored');
        console.log('   • Check: Navigation links are light and readable');
        console.log('   • Check: All text is readable (no black on black)\n');

        console.log('5. GET STARTED PAGE TEST:');
        console.log('   • Navigate to: http://localhost:8086/get-started');
        console.log('   • Note: You may need to sign in first');
        console.log('   • Verify theme toggle button is present');
        console.log('   • Click toggle and verify theme changes');
        console.log('   • Check: "Welcome to Twin Me" text is visible in both themes');
        console.log('   • Check: Card backgrounds adapt to theme\n');

        console.log('6. PERSISTENCE TEST:');
        console.log('   • Toggle theme to dark mode');
        console.log('   • Refresh the page (F5)');
        console.log('   • Expected: Dark theme should persist after refresh\n');

        console.log('7. CONSOLE LOG VERIFICATION:');
        console.log('   • Open DevTools Console');
        console.log('   • Click theme toggle');
        console.log('   • Expected logs:');
        console.log('     - "🎨 Theme toggle clicked, current theme: [light/dark]"');
        console.log('     - "🎨 Switching to theme: [dark/light]"\n');

        console.log('=' .repeat(50));
        console.log('\n📋 Quick Test Checklist:\n');
        console.log('[ ] Theme toggle button is visible in navigation');
        console.log('[ ] Clicking toggle changes data-theme attribute');
        console.log('[ ] Light mode: Background is light, text is dark');
        console.log('[ ] Dark mode: Background is dark, text is light');
        console.log('[ ] No black-on-black or white-on-white text');
        console.log('[ ] Theme persists after page refresh');
        console.log('[ ] Theme toggle works on /get-started page');
        console.log('[ ] Console logs show theme changes\n');

        console.log('=' .repeat(50));
        console.log('\n🔍 Browser DevTools Commands:\n');
        console.log('// Check current theme:');
        console.log('document.documentElement.getAttribute("data-theme")\n');
        console.log('// Check localStorage:');
        console.log('localStorage.getItem("theme")\n');
        console.log('// Check theme CSS variables (light mode):');
        console.log('getComputedStyle(document.documentElement).getPropertyValue("--background")\n');
        console.log('// Force theme change (for testing):');
        console.log('document.documentElement.setAttribute("data-theme", "dark")\n');

        console.log('=' .repeat(50));
        console.log('\n💡 Tip: Use browser screenshots to compare themes side-by-side');
        console.log('   • Windows: Win + Shift + S');
        console.log('   • Mac: Cmd + Shift + 4\n');
      });
    });
  }
};

// Run tests
tests.runTests();
