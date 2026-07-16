// Light/dark toggle. The inline <head> snippet applies the saved theme before
// first paint; this script only mounts the floating toggle and switches it.
// ?theme=light|dark in the URL overrides (handy for testing/sharing).
(function () {
  var root = document.documentElement;
  // theme-aware imagery: any <img data-light="..."> swaps to that source in light mode
  function applyImages(light) {
    var imgs = document.querySelectorAll('img[data-light]');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!img.dataset.dark) img.dataset.dark = img.getAttribute('src');
      img.setAttribute('src', light ? img.dataset.light : img.dataset.dark);
    }
  }
  function setTheme(light, persist) {
    if (light) root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    applyImages(light);
    if (persist) { try { localStorage.setItem('claura-theme', light ? 'light' : 'dark'); } catch (e) { /* private mode */ } }
    var b = document.getElementById('themeToggle');
    if (b) b.textContent = light ? '◑' : '◐'; // ◑ / ◐ glyphs, not emoji
  }
  function mount() {
    var b = document.createElement('button');
    b.id = 'themeToggle';
    b.setAttribute('aria-label', 'Switch between light and dark');
    b.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99;width:42px;height:42px;' +
      'border-radius:12px;border:1px solid var(--card-border);background:var(--card);color:var(--text);' +
      'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);cursor:pointer;font-size:16px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.18);font-family:inherit;';
    b.onclick = function () { setTheme(!root.hasAttribute('data-theme'), true); };
    document.body.appendChild(b);
    setTheme(root.hasAttribute('data-theme'), false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
