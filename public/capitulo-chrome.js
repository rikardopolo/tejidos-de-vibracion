/* capitulo-chrome.js · Tejidos de Vibración
   Comportamiento del chrome de capítulo (CapituloLayout):
     - <details id="cap-toc"> cierra al click fuera o ESC
     - header #cap-chrome añade .is-scrolled al hacer scroll
   CSP-safe: script externo, sin eval ni inline.
   El reader (#reader-controls) lo cablea /libro-reader.js.
   El reading-progress lo maneja un inline en CapituloLayout. */

(function () {
  'use strict';

  // ── TOC details · cierre por outside-click / ESC ──────────────────
  var toc = document.getElementById('cap-toc');
  if (toc) {
    document.addEventListener('click', function (e) {
      if (!toc.open) return;
      if (toc.contains(e.target)) return;
      toc.open = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toc.open) toc.open = false;
    });
  }

  // ── Header sticky · sombra al hacer scroll ────────────────────────
  var chrome = document.getElementById('cap-chrome');
  if (chrome) {
    var onScroll = function () {
      chrome.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
