/* Scroll al top en CADA carga · cada pieza empieza desde el inicio.
   Render-blocking en <head> (sin defer): corre en toda carga, incluida la
   restauracion desde bfcache (back/forward), donde los scripts defer NO se
   re-ejecutan. Externalizado de BookReader.astro para cumplir CSP. */
(function () {
  if ('scrollRestoration' in history) {
    try { history.scrollRestoration = 'manual'; } catch (e) {}
  }
  var toTop = function () { window.scrollTo(0, 0); };
  toTop();
  window.addEventListener('pageshow', toTop);
  window.addEventListener('DOMContentLoaded', toTop);
})();
