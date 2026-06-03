/* Reader prefs aplicadas antes del primer paint (evita FOUC).
   Externalizado de BookReader.astro para cumplir CSP script-src 'self'. */
(function () {
  try {
    var s = localStorage.getItem('tdv-reader-size') || 'default';
    var m = localStorage.getItem('tdv-reader-mode') || 'day';
    document.documentElement.setAttribute('data-reader-size', s);
    document.documentElement.setAttribute('data-reader-mode', m);
  } catch (e) {}
})();
