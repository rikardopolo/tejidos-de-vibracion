// comprar-checkout.js · Botón de compra → crea el checkout y redirige a Lemon Squeezy.
// First-party, CSP-safe (script-src 'self'). El fetch es al mismo origen; la
// redirección al checkout_url es navegación (no fetch) → no toca connect-src.
(function () {
  'use strict';

  var buttons = document.querySelectorAll('[data-checkout-button]');
  if (!buttons.length) return;

  function setStatus(btn, msg) {
    var container = btn.closest('.pv-cta-bloque, .pv-cierre') || btn.parentElement;
    var status = container ? container.querySelector('[data-checkout-status]') : null;
    if (status) status.textContent = msg;
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Abriendo el pago…';
      setStatus(btn, '');
      try {
        var res = await fetch('/api/checkout/bundle-preventa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ website: '' }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data && data.checkout_url) {
          window.location.href = data.checkout_url;
          return; // dejamos el botón deshabilitado mientras navega
        }
        btn.disabled = false;
        btn.textContent = original;
        setStatus(btn, 'No se pudo abrir el pago. Inténtalo de nuevo en un momento.');
      } catch (e) {
        btn.disabled = false;
        btn.textContent = original;
        setStatus(btn, 'No se pudo conectar. Comprueba tu conexión.');
      }
    });
  });
})();
