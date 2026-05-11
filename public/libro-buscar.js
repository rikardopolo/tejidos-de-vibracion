(function () {
  'use strict';

  var INDEX = [
    {
      href: '/obertura',
      title: 'Obertura · El tejedor consciente despierta',
      snippets: [
        'la frontera entre la ecuación y el silencio',
        'Penélope tejía de día un sudario y lo destejía de noche',
        'tu cuerpo no es una cosa. Es una orquesta',
        'leer con el cuerpo. No en sentido metafórico. En sentido literal',
      ],
    },
    {
      href: '/capitulo/cap-1-universo-sinfonia',
      title: 'Cap. 1 · El universo como sinfonía',
      snippets: [
        'la cuerda no vibra en una forma; la cuerda es la forma',
        'vibración significa exactamente lo que la física dice que significa',
        'una vibración sostenida produce forma',
        'la cimática como sonido hecho forma',
      ],
    },
    {
      href: '/capitulo/cap-2-ciencia-escuchar',
      title: 'Cap. 2 · La ciencia que aprendió a escuchar',
      snippets: [
        'Fourier demostró que cualquier función periódica puede escribirse como suma de senos y cosenos',
        'la cóclea es un analizador espectral',
        'tu oído no recibe el mundo: lo decodifica',
        'las emisiones otoacústicas: tu oído también canta',
      ],
    },
    {
      href: '/capitulo/cap-3-mundo-cuantico',
      title: 'Cap. 3 · El mundo cuántico',
      snippets: [
        'el experimento de la doble rendija cambió de qué hablamos cuando hablamos de mundo',
        'la medición no descubre dónde estaba algo: lo obliga a estar',
        'Schrödinger y la función de onda como lo que el electrón es',
        'el átomo no es un sistema solar en miniatura. Es un instrumento',
      ],
    },
  ];

  function runSearch(q) {
    q = (q || '').trim().toLowerCase();
    var out = document.getElementById('search-results');
    var empty = document.getElementById('search-empty');
    if (!out || !empty) return;
    out.innerHTML = '';
    if (!q) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    var results = [];
    for (var i = 0; i < INDEX.length; i++) {
      var entry = INDEX[i];
      var matches = entry.snippets.filter(function (s) {
        return s.toLowerCase().includes(q);
      });
      if (matches.length) results.push({ href: entry.href, title: entry.title, matches: matches });
    }
    if (results.length === 0) {
      out.innerHTML =
        '<p class="prose"><em>Sin resultados para «' +
        q +
        '» en los capítulos abiertos. Tal vez ese hilo viva en un capítulo todavía en gestación.</em></p>';
      return;
    }
    var html = results
      .map(function (r) {
        var highlighted = r.matches[0].replace(
          new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
          '<em style="background: rgba(212,160,23,0.22); padding: 0 2px;">$1</em>'
        );
        return (
          '<a class="toc-entry" href="' +
          r.href +
          '" style="grid-template-columns: 1fr;"><span class="toc-entry__body"><span class="toc-entry__title">' +
          r.title +
          '</span><span class="toc-entry__sub">…' +
          highlighted +
          '…</span></span></a>'
        );
      })
      .join('');
    out.innerHTML = html;
  }

  function init() {
    var form = document.getElementById('form-buscar');
    var field = document.getElementById('search-q');
    var suggLinks = document.querySelectorAll('[data-search-suggest]');

    if (form && field) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        runSearch(field.value);
      });
    }

    suggLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var term = link.getAttribute('data-search-suggest');
        if (field) field.value = term;
        runSearch(term);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
