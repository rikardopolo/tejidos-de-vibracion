// comprar-checkout.js · Botón de compra → crea el checkout y redirige a Lemon Squeezy.
// First-party, CSP-safe (script-src 'self'). El fetch es al mismo origen; la
// redirección al checkout_url es navegación (no fetch) → no toca connect-src.
(function () {
  'use strict';

  var buttons = document.querySelectorAll('[data-checkout-button]');
  if (!buttons.length) return;

  // Un solo checkout a la vez: con dos botones (hero + cierre) un doble-click
  // podría crear dos checkouts. Flag global + deshabilitar TODOS los botones
  // (ambas instancias comparten este mismo guard).
  var inProgress = false;
  // Aquí NO se comprueba el dominio del checkout: eso lo hace el servidor, en
  // `src/lib/url-pago.mjs`, donde hay tests. Este fichero tenía su propia lista
  // (`/^https:\/\/[a-z0-9-]+\.lemonsqueezy\.com\//`) que no incluía el dominio
  // propio de la tienda: el botón rechazaba su propio checkout y enseñaba «No se
  // pudo abrir el pago» a todo el que pulsaba Comprar, durante semanas, sin que
  // nada lo delatara. Una segunda lista aquí solo puede volver a desincronizarse.
  // Se queda el esquema, que no depende de ningún dominio y frena un
  // `javascript:` si la respuesta viniera contaminada.
  function esHttps(u) {
    return typeof u === 'string' && /^https:\/\//i.test(u);
  }

  function setStatus(btn, msg) {
    var container = btn.closest('.pv-cta-bloque, .pv-cierre') || btn.parentElement;
    var status = container ? container.querySelector('[data-checkout-status]') : null;
    if (status) status.textContent = msg;
  }

  function setAllDisabled(state) {
    buttons.forEach(function (b) { b.disabled = state; });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (inProgress) return;
      inProgress = true;
      var original = btn.textContent;
      setAllDisabled(true);
      btn.textContent = 'Abriendo el pago…';
      setStatus(btn, '');
      try {
        var res = await fetch('/api/checkout/bundle-preventa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ website: '' }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data && esHttps(data.checkout_url)) {
          window.location.href = data.checkout_url; // navegamos; dejamos todo deshabilitado
          return;
        }
        inProgress = false;
        setAllDisabled(false);
        btn.textContent = original;
        setStatus(btn, 'No se pudo abrir el pago. Inténtalo de nuevo en un momento.');
      } catch (e) {
        inProgress = false;
        setAllDisabled(false);
        btn.textContent = original;
        setStatus(btn, 'No se pudo conectar. Comprueba tu conexión.');
      }
    });
  });
})();
