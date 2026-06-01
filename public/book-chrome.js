/* book-chrome.js · Tejidos de Vibración
   Comportamiento del chrome compartido (BookReader):
     - scroll-restoration manual: cada pieza carga desde el top (incl.
       back/forward con ANTERIOR, que el navegador restauraría con 'auto')
     - el <details> del TOC (slot izquierdo del header) cierra al click
       fuera o ESC, sea cual sea su id (cap-toc / obertura-toc)
     - el header #book-chrome añade .is-scrolled al hacer scroll
   CSP-safe: script externo, sin eval ni inline.
   El reader (#reader-controls) lo cablea /libro-reader.js.
   El reading-progress lo maneja un inline en BookReader. */

(function () {
  'use strict';

  // ── Scroll al top en cada carga ───────────────────────────────────
  // history.scrollRestoration='auto' (default) restaura el scroll guardado
  // al volver a una URL ya visitada (ANTERIOR/back). Lo desactivamos para
  // que toda pieza empiece desde el inicio. Va ANTES del early-return para
  // aplicar en cualquier página del libro.
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo({ top: 0, behavior: 'instant' });

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
