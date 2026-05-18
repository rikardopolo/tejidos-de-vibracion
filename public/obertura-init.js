/* Obertura reader · pre-paint init para evitar flash de tema/tamaño.
   Aplica las preferencias guardadas (data-font-size, data-theme) al <body>
   en cuanto exista, antes de que el navegador pinte la primera frame.
   ReaderControls.astro ya escribe estas keys en localStorage al cambiar. */
(function () {
  try {
    var fontSize = localStorage.getItem('obertura.fontSize') || 'm';
    var theme = localStorage.getItem('obertura.theme') || 'paper';

    function apply() {
      if (!document.body) return;
      document.body.setAttribute('data-font-size', fontSize);
      document.body.setAttribute('data-theme', theme);
    }
    if (document.body) {
      apply();
    } else {
      // body aún no parseado — aplicar tan pronto exista
      var observer = new MutationObserver(function () {
        if (document.body) {
          apply();
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
  } catch (_) {
    // localStorage no disponible (modo privado, sandbox) → defaults a paper/m
  }
})();
