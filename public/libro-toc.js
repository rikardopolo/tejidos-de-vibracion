/* libro-toc.js · Tejidos de Vibración
   TOC flotante del capítulo: construye la lista desde los h2/h3 del DOM,
   gestiona apertura/cierre y scroll spy.
   CSP-safe: script externo, sin eval ni inline. */

(function () {
  'use strict';

  function init() {
    var trigger = document.getElementById('book-toc-trigger');
    var nav = document.getElementById('book-toc');
    if (!trigger || !nav) return;

    var list = nav.querySelector('.book-toc__list');
    var closeBtn = nav.querySelector('.book-toc__close');
    if (!list) return;

    // Build TOC from headings inside <article class="measure">
    var article = document.querySelector('article.measure');
    if (!article) {
      trigger.hidden = true;
      return;
    }

    var headings = article.querySelectorAll('h2, h3');
    if (headings.length === 0) {
      trigger.hidden = true;
      return;
    }

    headings.forEach(function (h, idx) {
      // Auto-assign a stable id if missing
      if (!h.id) {
        h.id = 'h-' + idx + '-' + h.textContent
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 50);
      }

      var li = document.createElement('li');
      li.className = h.tagName === 'H3' ? 'is-h3' : 'is-h2';

      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;

      li.appendChild(a);
      list.appendChild(li);
    });

    // Toggle panel
    trigger.addEventListener('click', function () {
      nav.hidden = !nav.hidden;
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        nav.hidden = true;
      });
    }

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (nav.hidden) return;
      if (!nav.contains(e.target) && e.target !== trigger) {
        nav.hidden = true;
      }
    });

    // Scroll spy via IntersectionObserver
    if ('IntersectionObserver' in window) {
      var links = list.querySelectorAll('a');
      var linkMap = new Map();
      links.forEach(function (a) {
        linkMap.set(a.getAttribute('href').slice(1), a);
      });

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var link = linkMap.get(entry.target.id);
          if (link) {
            links.forEach(function (a) { a.classList.remove('is-active'); });
            link.classList.add('is-active');
          }
        });
      }, { rootMargin: '-30% 0px -60% 0px' });

      headings.forEach(function (h) { observer.observe(h); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
