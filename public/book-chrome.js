/* book-chrome.js · Tejidos de Vibración
   Comportamiento del chrome compartido (BookReader):
     - el <details> del TOC (slot izquierdo del header) cierra al click
       fuera o ESC, sea cual sea su id (cap-toc / obertura-toc)
     - el header #book-chrome añade .is-scrolled al hacer scroll
   CSP-safe: script externo, sin eval ni inline.
   El reader (#reader-controls) lo cablea /libro-reader.js.
   El reading-progress lo maneja un inline en BookReader.
   El scroll-al-top (scrollRestoration manual + pageshow) lo maneja un
   inline en el <head> de BookReader (corre en cada carga, no deferred). */

(function () {
  'use strict';

  var chrome = document.getElementById('book-chrome');
  if (!chrome) return;

  // ── TOC <details> · cierre por outside-click / ESC ────────────────
  var toc = chrome.querySelector('details');
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
  var onScroll = function () {
    chrome.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
