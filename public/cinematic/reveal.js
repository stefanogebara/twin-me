// Scroll-triggered reveal. Each .up element fades/rises in when it enters the viewport.
// The `.js` class is set inline in <head> so content starts hidden with no flash;
// if this script never runs, CSS falls back to the plain load animation.
(function () {
  var els = [].slice.call(document.querySelectorAll('.up'));
  function show(el) { el.classList.add('in-view'); }
  if (!('IntersectionObserver' in window) || !els.length) { els.forEach(show); return; }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  var vh = window.innerHeight || 800;
  els.forEach(function (el) {
    // Anything already on screen at load reveals immediately (don't depend on an IO tick);
    // everything below the fold waits for scroll.
    if (el.getBoundingClientRect().top < vh) show(el);
    else io.observe(el);
  });
})();
