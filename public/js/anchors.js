/* anchors.js — ancla copiable en los headings de lectura. Externo (CSP
   script-src 'self'). El contenido de la Obertura es .astro (HTML crudo, no
   pasa por el pipeline markdown), así que los ids se generan aquí: cubre
   .astro y .mdx por igual sin tocar el build. Hover -> aparece un # discreto;
   click copia la URL con #id. */
(function () {
  function slug(s) {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // tildes
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
      .replace(/-$/, '');
  }
  var hs = document.querySelectorAll('main h2, main h3');
  Array.prototype.forEach.call(hs, function (h) {
    if (!h.id) {
      var base = slug(h.textContent || '') || 'seccion';
      var id = base, i = 2;
      while (document.getElementById(id)) id = base + '-' + i++;
      h.id = id;
    }
    if (!navigator.clipboard) return; // sin copy: deja el id (deep-link), sin botón
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'anchor-copy';
    btn.textContent = '#';
    btn.setAttribute('aria-label', 'Copiar enlace a esta sección');
    h.appendChild(btn);
    btn.addEventListener('click', function () {
      var url = location.origin + location.pathname + '#' + h.id;
      navigator.clipboard.writeText(url).then(function () {
        btn.classList.add('is-copied');
        btn.textContent = '✓';
        setTimeout(function () {
          btn.classList.remove('is-copied');
          btn.textContent = '#';
        }, 1600);
      });
    });
  });
  // los ids se asignan tras el load -> re-intenta el scroll al ancla de la URL
  if (location.hash.length > 1) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }
})();
