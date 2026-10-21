// Checkout de suscripción: script externo, mismo origen, sin deshabilitar botones.
(function () {
  'use strict';

  document.querySelectorAll('[data-suscripcion-checkout]').forEach(function (raiz) {
    if (raiz.dataset.suscripcionMontada) return;
    raiz.dataset.suscripcionMontada = 'true';
    var estado = raiz.querySelector('[data-suscripcion-estado]');
    var enviando = false;
    var errorPago = 'No pudimos abrir el pago. Inténtalo de nuevo en un momento.';

    raiz.querySelectorAll('[data-suscripcion-plan]').forEach(function (boton) {
      boton.addEventListener('click', async function () {
        if (enviando) return; // evita dos checkouts; ambos botones conservan su foco
        enviando = true;
        estado.textContent = 'Abriendo el pago…';
        var controller = new AbortController();
        var limite = setTimeout(function () { controller.abort(); }, 15000);
        try {
          var respuesta = await fetch('/api/checkout/suscripcion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: boton.dataset.suscripcionPlan }),
            signal: controller.signal,
          });
          var datos = await respuesta.json().catch(function () { return {}; });
          if (respuesta.status === 401) {
            estado.textContent = 'Vuelve a entrar para suscribirte.';
            window.location.assign(raiz.dataset.entrar);
            return;
          }
          if (respuesta.ok && datos && typeof datos.checkout_url === 'string') {
            // El servidor valida los dominios en url-pago.mjs. No duplicar aquí
            // esa lista; el esquema bloquea javascript: sin depender de la tienda.
            var destino = new URL(datos.checkout_url);
            if (destino.protocol === 'https:' && !destino.username && !destino.password) {
              window.location.assign(destino.href);
              return;
            }
          }
          estado.textContent = respuesta.status === 429
            ? 'Espera un minuto e inténtalo de nuevo.'
            : datos && datos.error === 'correo_sin_verificar'
              ? 'Confirma tu correo en tu cuenta para suscribirte.'
              : errorPago;
        } catch (error) {
          estado.textContent = error && error.name === 'AbortError'
            ? errorPago
            : 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
        } finally {
          clearTimeout(limite);
          enviando = false;
        }
      });
    });
  });
})();
