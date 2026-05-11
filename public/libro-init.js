/* libro-init.js · Tejidos de Vibración
   Scroll progress rail + header sticky toggle.
   CSP-safe: script externo, sin eval ni inline.
   Los elementos HTML son renderizados por los componentes Astro;
   este script solo añade comportamiento reactivo al scroll. */

(function () {
  'use strict';

  var header = null;
  var rail = null;

  function onScroll() {
    var y = window.scrollY;

    if (header) {
      header.classList.toggle('is-scrolled', y > 8);
    }

    if (rail) {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(100, (y / max) * 100) : 0;
      rail.style.setProperty('--p', p + '%');
    }
  }

  function init() {
    header = document.getElementById('book-header');
    rail = document.getElementById('progress-rail');

    if (header || rail) {
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
