import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esUrlDePago, esEnlaceDePruebaStripe, HOSTS_TIENDA } from './url-pago.mjs';

// ── La regresión que costó todas las ventas ─────────────────────────────────

test('acepta el checkout REAL que emite Lemon Squeezy para esta tienda', () => {
  // URL literal capturada de producción el 5-ago-2026. La comprobación anterior
  // (`/^https:\/\/[a-z0-9-]+\.lemonsqueezy\.com\//`) la RECHAZABA: el botón
  // enseñaba «No se pudo abrir el pago» a todo el mundo. Si este test se pone
  // rojo, nadie puede comprar.
  assert.equal(
    esUrlDePago(
      'https://tejidosdevibracion.store/checkout/custom/e1aa1048-18ea-4c45-ab3b-5e7df89622fd?signature=f447b4ca5d6666bf141b2eb212d3dfd04234bd0d56e02eb9f1d84f9bda3948ae',
    ),
    true,
  );
});

test('sigue aceptando el dominio genérico de Lemon Squeezy', () => {
  // La tienda puede volver a emitir por ahí; aceptar ambos es el punto.
  assert.equal(esUrlDePago('https://tejidosdevibracion.lemonsqueezy.com/checkout/abc'), true);
  assert.equal(esUrlDePago('https://lemonsqueezy.com/checkout/abc'), true);
});

// ── Stripe · Managed Payments ───────────────────────────────────────────────

test('acepta el enlace de pago REAL de Stripe capturado del checkout', () => {
  // URL literal del enlace con el que se hizo la compra de prueba (6-ago-2026,
  // factura Q5CJBGM3-0001, recibo 2894-8587). El host es el MISMO en real: al
  // crear el enlace de producción, clavar aquí también su URL literal.
  assert.equal(esUrlDePago('https://buy.stripe.com/test_4gMdR8eDOcol2vN7ucfjG00'), true);
  // Forma del enlace en real (sin `/test_`).
  assert.equal(esUrlDePago('https://buy.stripe.com/4gMdR8eDOcol2vN7ucfjG00'), true);
});

test('distingue el enlace de PRUEBA del real', () => {
  // Un enlace de prueba en producción cobra cero y no da ningún error: el
  // desenlace es idéntico al de una venta buena. Por eso se detecta aquí.
  assert.equal(esEnlaceDePruebaStripe('https://buy.stripe.com/test_4gMdR8eDOcol2vN7ucfjG00'), true);
  assert.equal(esEnlaceDePruebaStripe('https://buy.stripe.com/4gMdR8eDOcol2vN7ucfjG00'), false);
  // No confunde un `test_` que no esté al principio de la ruta.
  assert.equal(esEnlaceDePruebaStripe('https://buy.stripe.com/abc/test_123'), false);
  // Ni marca como «de prueba» lo que ni siquiera es un enlace de pago válido.
  assert.equal(esEnlaceDePruebaStripe('https://evil.com/test_abc'), false);
  assert.equal(esEnlaceDePruebaStripe(undefined), false);
});

// ── Lo que la comprobación existe para impedir ──────────────────────────────

test('rechaza cualquier host ajeno, incluidos los que lo imitan', () => {
  for (const malo of [
    'https://evil.com/checkout',
    'https://lemonsqueezy.com.evil.com/checkout', // sufijo falso
    'https://notlemonsqueezy.com/checkout', // sin el punto separador
    'https://tejidosdevibracion.store.evil.com/checkout',
    'https://evil.com/?x=https://tejidosdevibracion.store/', // el host real en el query
    'https://buy.stripe.com.evil.com/test_abc', // sufijo falso sobre el host de Stripe
    'https://buy-stripe.com/test_abc',
    'https://evil.com/?x=https://buy.stripe.com/test_abc',
  ]) {
    assert.equal(esUrlDePago(malo), false, `debería rechazar ${malo}`);
  }
});

test('rechaza esquemas que no son https', () => {
  assert.equal(esUrlDePago('http://tejidosdevibracion.store/checkout'), false);
  assert.equal(esUrlDePago('javascript:alert(1)'), false);
  assert.equal(esUrlDePago('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(esUrlDePago('//tejidosdevibracion.store/checkout'), false);
});

test('rechaza lo que no es una URL, sin lanzar', () => {
  for (const nada of [undefined, null, '', 'no soy una url', 42, {}, ['https://tejidosdevibracion.store/']]) {
    assert.equal(esUrlDePago(nada), false);
  }
});

test('el dominio de la tienda está en la lista y no como subcadena suelta', () => {
  // Guarda contra «arreglarlo» con un `includes()` sobre la cadena entera, que
  // volvería a aceptar `evil.com/?tejidosdevibracion.store`.
  assert.ok(HOSTS_TIENDA.includes('tejidosdevibracion.store'));
  assert.equal(esUrlDePago('https://x.com/tejidosdevibracion.store'), false);
});
